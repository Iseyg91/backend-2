const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Sert les fichiers HTML statiques depuis le dossier "pages"
app.use(express.static('pages'));

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ Erreur MongoDB :', err));

// Schéma d'e-mail
const emailSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  verified: { type: Boolean, default: false },
  token: { type: String, required: true }
});

const Email = mongoose.model('Email', emailSchema);

// Configurer le transport d’e-mail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Transporteur non prêt :", error);
  } else {
    console.log("✅ Transporteur prêt !");
  }
});

// ✅ Inscription et envoi du mail de confirmation
app.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  const token = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const newEmail = new Email({ address: email, token });
    await newEmail.save();

    const confirmLink = `https://pdd-xrdi.onrender.com/confirm/${token}`;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Code de vérification - Project : Delta",
    html: `
      <p>Merci pour ton inscription !</p>
      <p>Voici ton code de vérification :</p>
      <h2 style="font-size: 24px; color: #7c3aed;">${token}</h2>
      <p>Entre ce code sur le site pour confirmer ton e-mail.</p>
    `
  });

    res.status(200).json({ message: '📩 Email de confirmation envoyé' });
  } catch (err) {
    if (err.code === 11000) {
      res.status(409).json({ error: '⚠️ Cet e-mail est déjà enregistré' });
    } else {
      console.error(err);
      res.status(500).json({ error: '❌ Erreur serveur' });
    }
  }
});

// ✅ Confirmation d'inscription (sans redirection HTML)
app.get('/confirm/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const emailEntry = await Email.findOne({ token });
    if (!emailEntry) return res.status(400).send('❌ Lien invalide ou expiré.');

    if (emailEntry.verified) {
      return res.status(200).send('✅ Cet e-mail est déjà confirmé.');
    }

    emailEntry.verified = true;
    emailEntry.token = '';
    await emailEntry.save();

    return res.status(200).send('✅ Ton e-mail a bien été confirmé. Merci !');
  } catch (err) {
    console.error('Erreur de confirmation :', err);
    res.status(500).send('❌ Erreur serveur pendant la confirmation.');
  }
});

// ✅ Envoi de newsletter
app.post('/send-newsletter', async (req, res) => {
  const { subject, content } = req.body;

  if (!subject || !content) {
    return res.status(400).json({ error: 'Sujet et contenu requis' });
  }

  try {
    const allEmails = await Email.find({ verified: true });
    console.log("Adresses ciblées :", allEmails.map(e => e.address));

    const sendPromises = allEmails.map(entry => {
      return transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: entry.address,
        subject,
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

// ✅ Test d'envoi de mail
app.get('/test-mail', async (req, res) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: 'Test de mail',
      text: 'Ceci est un test de Project : Delta'
    });
    res.send('✅ Mail de test envoyé');
  } catch (err) {
    console.error('❌ Erreur envoi test :', err);
    res.status(500).send('❌ Erreur pendant le test');
  }
});

// ✅ Désinscription
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

app.post('/verify-code', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email ou code manquant' });

  try {
    const entry = await Email.findOne({ address: email });

    if (!entry) {
      return res.status(404).json({ error: "Adresse email non trouvée." });
    }

    if (entry.verified) {
      return res.status(200).json({ message: "✅ Adresse déjà vérifiée." });
    }

    if (entry.token !== code) {
      return res.status(401).json({ error: "❌ Code incorrect." });
    }

    entry.verified = true;
    entry.token = '';
    await entry.save();

    return res.status(200).json({ message: "✅ Adresse vérifiée avec succès !" });
  } catch (err) {
    console.error("Erreur pendant la vérification :", err);
    res.status(500).json({ error: "❌ Erreur serveur pendant la vérification." });
  }
});

// ✅ Lancement du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`);
});
