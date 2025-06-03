const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ Erreur MongoDB :', err));

// Schéma d'e-mail
const tempEmailSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  token: { type: String, required: true },
  createdAt: { type: Date, expires: '1d', default: Date.now } // expire après 24h
});
const TempEmail = mongoose.model('TempEmail', tempEmailSchema);

app.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  try {
    const existing = await Email.findOne({ address: email });
    if (existing) return res.status(409).json({ error: '⚠️ Cet e-mail est déjà validé' });

    const token = crypto.randomBytes(32).toString('hex');
    await TempEmail.findOneAndUpdate(
      { address: email },
      { address: email, token },
      { upsert: true, new: true }
    );

    const verificationLink = `${process.env.FRONTEND_URL}/verify?token=${token}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Vérifie ton e-mail pour Project : Delta',
      html: `
        <h2>Bienvenue !</h2>
        <p>Clique sur le lien ci-dessous pour confirmer ton adresse e-mail :</p>
        <a href="${verificationLink}">${verificationLink}</a>
        <p>Ce lien expirera dans 24 heures.</p>
      `
    });

    res.status(200).json({ message: '📧 Vérification envoyée. Consulte ta boîte mail.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '❌ Erreur lors de l’envoi de l’e-mail de vérification' });
  }
});

// Configurer le transport d’e-mail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post('/send-newsletter', async (req, res) => {
  const { subject, content } = req.body;

  if (!subject || !content) {
    return res.status(400).json({ error: 'Sujet et contenu requis' });
  }

  try {
    const allEmails = await Email.find();
    console.log("Adresses ciblées :", allEmails.map(e => e.address)); // ✅ ICI

    const sendPromises = allEmails.map(entry => {
      return transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: entry.address,
        subject: subject,
        html: content
      });
    });

    await Promise.all(sendPromises);

    res.status(200).json({ message: '📧 Newsletter envoyée à tous les abonnés' });
  } catch (err) {
    console.error('Erreur envoi mail :', err);
    res.status(500).json({ error: 'Erreur serveur pendant l’envoi' });
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Transporteur non prêt :", error);
  } else {
    console.log("✅ Transporteur prêt !");
  }
});

app.get('/test-mail', async (req, res) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // pour tester sur toi-même
      subject: 'Test de mail',
      text: 'Ceci est un test de Project : Delta'
    });
    res.send('✅ Mail de test envoyé');
  } catch (err) {
    console.error('❌ Erreur envoi test :', err);
    res.status(500).send('❌ Erreur pendant le test');
  }
});

// Route DELETE pour se désinscrire
app.delete('/unsubscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  try {
    const result = await Email.deleteOne({ address: email });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Adresse e-mail non trouvée' });
    }
    res.status(200).json({ message: '✅ Désinscription réussie' });
  } catch (err) {
    console.error('❌ Erreur lors de la désinscription :', err);
    res.status(500).json({ error: '❌ Erreur serveur pendant la désinscription' });
  }
});
app.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token manquant');

  try {
    const temp = await TempEmail.findOne({ token });
    if (!temp) return res.status(400).send('Lien invalide ou expiré');

    const alreadyVerified = await Email.findOne({ address: temp.address });
    if (alreadyVerified) {
      await TempEmail.deleteOne({ token }); // nettoyage
      return res.status(409).send('Adresse déjà vérifiée');
    }

    await new Email({ address: temp.address }).save();
    await TempEmail.deleteOne({ token });

    res.status(200).send('✅ E-mail vérifié et enregistré avec succès');
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Erreur lors de la vérification');
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`);
});
