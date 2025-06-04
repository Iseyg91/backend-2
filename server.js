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
// Emails confirmés
const emailSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true }
});
const Email = mongoose.model('Email', emailSchema);

// Emails en attente
const pendingEmailSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 } // expire après 1h
});
const PendingEmail = mongoose.model('PendingEmail', pendingEmailSchema);

// Route POST pour s'abonner
app.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  try {
    const existing = await Email.findOne({ address: email });
    if (existing) return res.status(409).json({ error: '⚠️ Cet e-mail est déjà confirmé' });

    const token = crypto.randomBytes(32).toString('hex');

    await PendingEmail.findOneAndUpdate(
      { address: email },
      { address: email, token },
      { upsert: true }
    );

    const confirmationLink = `https://votresite.com/confirm?token=${token}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Confirme ton inscription à Project : Delta ✉️',
      html: `
        <p>Bonjour,</p>
        <p>Merci de t'être inscrit. Clique sur le lien ci-dessous pour confirmer ton adresse :</p>
        <a href="${confirmationLink}">${confirmationLink}</a>
        <p>Ce lien expire dans 1 heure.</p>
      `
    });

    res.status(200).json({ message: '📧 Mail de confirmation envoyé' });

  } catch (err) {
    console.error('❌ Erreur lors de l’envoi de confirmation :', err);
    res.status(500).json({ error: '❌ Erreur serveur' });
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
app.get('/confirm', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('❌ Token manquant');

  try {
    const pending = await PendingEmail.findOne({ token });
    if (!pending) return res.status(400).send('❌ Token invalide ou expiré');

    const existing = await Email.findOne({ address: pending.address });
    if (existing) return res.status(409).send('⚠️ Adresse déjà confirmée');

    await new Email({ address: pending.address }).save();
    await PendingEmail.deleteOne({ token });

    res.send('✅ Adresse e-mail confirmée avec succès !');
  } catch (err) {
    console.error('❌ Erreur confirmation :', err);
    res.status(500).send('❌ Erreur serveur');
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`);
});
