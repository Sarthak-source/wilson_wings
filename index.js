const express = require('express');
const cors = require('cors');
const mongoose = require("mongoose");
const User = require('./models/User');
const Post = require('./models/Post');
const bcrypt = require('bcryptjs');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const uploadMiddleware = multer({ storage: multer.memoryStorage() });
const admin = require('firebase-admin');
require('dotenv').config();

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_BUCKET,
  databaseURL:process.env.FIREBASE_REALTIME_DATABASE_URL
});

const bucket = admin.storage().bucket();
const secret = process.env.JWT_SECRET;

app.use(cors({
  origin: '',
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.urlencoded({ extended: false }))
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

const uri = process.env.MONGO_URL;

mongoose.connect(uri, {
  serverSelectionTimeoutMS: 30000,
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const userRecord = await admin.auth().createUser({
      email: username,
      password: password,
    });

    res.json(userRecord);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Registration failed', error });
  }
});

app.get('/profile', (req, res) => {
  const token = req.header('Authorization').split(' ')[1];
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) throw err;
    res.json(info);
  });
});

app.post('/logout', async (req, res) => {
  try {
    res.clearCookie('token').json('Logged out successfully');
  } catch (error) {
    res.status(500).json({ message: 'An error occurred', error });
  }
});

app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
  const { originalname } = req.file;
  const { title, summary, content } = req.body;

  const fileUpload = bucket
    .file(`blog_covers/` + originalname);

  const blobStream = fileUpload.createWriteStream({

    metadata: {
      contentType: req.file.mimetype,
    },
  });

  blobStream.on('error', (err) => {
    console.error(err);
    res.status(500).json('Error uploading file');
  });

  blobStream.on('finish', async () => {
    const [url] = await fileUpload.getSignedUrl({
      action: 'read',
      expires: '03-01-2500',
    });

    const token = req.header('Authorization').split(' ')[1];
    jwt.verify(token, secret, {}, async (err, info) => {
      if (err) throw err;
      const postDoc = await Post.create({
        title,
        summary,
        content,
        cover: url,
        author: info.id,
      });
      res.json(postDoc);
    });
  });

  blobStream.end(req.file.buffer);
});

app.put('/post', uploadMiddleware.single('file'), async (req, res) => {
  const { id, title, summary, content } = req.body;

  const postDoc = await Post.findById(id);
  const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
  if (!isAuthor) {
    return res.status(400).json('you are not the author');
  }

  const fileUpload = bucket.file(req.file.originalname);

  const blobStream = fileUpload.createWriteStream({
    metadata: {
      contentType: req.file.mimetype,
    },
  });

  blobStream.on('error', (err) => {
    console.error(err);
    res.status(500).json('Error uploading file');
  });

  blobStream.on('finish', async () => {
    const [url] = await fileUpload.getSignedUrl({
      action: 'read',
      expires: '03-01-2500',
    });

    const token = req.header('Authorization').split(' ')[1];
    jwt.verify(token, secret, {}, async (err) => {
      if (err) throw err;
      await postDoc.update({
        title,
        summary,
        content,
        cover: url ? url : postDoc.cover,
      });
      res.json(postDoc);
    });
  });

  blobStream.end(req.file.buffer);
});

app.get('/post', async (req, res) => {
  res.json(
    await Post.find()
      .populate('author', ['username'])
      .sort({ createdAt: -1 })
      .limit(20)
  );
});

app.get('/post/:id', async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate('author', ['username']);
  res.json(postDoc);
});

app.listen(process.env.PORT, () => {
  console.log(`Server started on port ${process.env.PORT}`);
});
