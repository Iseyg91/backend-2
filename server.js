const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ Erreur MongoDB :', err));

// Schéma d'e-mail
const emailSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true }
});
const Email = mongoose.model('Email', emailSchema);

// Route POST pour s'abonner
app.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  try {
    const newEmail = new Email({ address: email });
    await newEmail.save();
    res.status(200).json({ message: '✅ Abonnement réussi' });
  } catch (err) {
    if (err.code === 11000) {
      res.status(409).json({ error: '⚠️ Cet e-mail est déjà enregistré' });
    } else {
      res.status(500).json({ error: '❌ Erreur serveur' });
    }
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`);
});
