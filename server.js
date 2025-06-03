const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
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
  address: { type: String, required: true, unique: true },
  verified: { type: Boolean, default: false },
  token: { type: String, required: true }
});

const Email = mongoose.model('Email', emailSchema); // ✅ À ajouter

app.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  const token = crypto.randomBytes(32).toString('hex');

  try {
    const newEmail = new Email({ address: email, token });
    await newEmail.save();

    // Lien de confirmation
    const confirmLink = `${process.env.BACK_URL}/confirm/${token}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Confirme ton inscription à Project : Delta",
      html: `<p>Merci pour ton inscription ! Clique sur le bouton ci-dessous pour confirmer ton e-mail :</p>
             <a href="${confirmLink}" style="background:#7c3aed;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">Confirmer</a>`
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
    const allEmails = await Email.find({ verified: true });
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
app.get('/confirm/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const emailEntry = await Email.findOne({ token });
    if (!emailEntry) return res.status(400).send('Lien invalide ou expiré.');

    if (emailEntry.confirmed) {
      return res.redirect(`${process.env.FRONT_URL}/deja-confirmé.html`);
    }

    emailEntry.confirmed = true;
    emailEntry.token = ''; // Invalider le token après usage
    await emailEntry.save();

    res.redirect(`${process.env.FRONT_URL}/email-confirmation.html`);
  } catch (err) {
    console.error('Erreur de confirmation :', err);
    res.status(500).send('Erreur serveur.');
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`);
});
