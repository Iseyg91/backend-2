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
  confirmationCode: { type: String }
});
const Email = mongoose.model('Email', emailSchema);

app.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  const confirmationCode = crypto.randomBytes(3).toString('hex'); // exemple: 'a1b2c3'

  try {
    const existing = await Email.findOne({ address: email });
    if (existing && existing.verified) {
      return res.status(409).json({ error: '⚠️ Cet e-mail est déjà vérifié' });
    }

    // Créer ou mettre à jour l'entrée avec un code de confirmation
    const newEmail = await Email.findOneAndUpdate(
      { address: email },
      { confirmationCode, verified: false },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Envoyer l'e-mail
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: '🔐 Confirme ton abonnement à Project : Delta',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background-color: #1e1e2f; color: #ffffff; padding: 20px; border-radius: 10px;">
          <div style="text-align: center;">
            <img src="https://i.imgur.com/FZyqUxz.png" alt="Project : Delta" style="width: 100px; margin-bottom: 20px;" />
            <h1 style="color: #4f46e5;">Bienvenue sur Project : Delta !</h1>
          </div>
      
          <p>Salut 👋,</p>
          <p>Merci de t'être inscrit à notre newsletter ! Afin de confirmer ton adresse email, entre le code suivant dans l’application :</p>
      
          <div style="text-align: center; margin: 30px 0;">
            <span style="display: inline-block; font-size: 28px; font-weight: bold; background-color: #4f46e5; color: white; padding: 10px 20px; border-radius: 8px;">
              ${confirmationCode}
            </span>
          </div>
      
          <p>Ce code est valide pour une durée limitée. Si tu n’es pas à l’origine de cette demande, tu peux ignorer ce message.</p>
      
          <hr style="margin: 30px 0; border: 0; border-top: 1px solid #444;" />
      
          <p style="font-size: 12px; color: #aaa; text-align: center;">
            Project : Delta • Tous droits réservés<br/>
            <a href="https://project-delta.fr" style="color: #6d6dff; text-decoration: none;">www.project-delta.fr</a>
          </p>
        </div>
      `
    });

    res.status(200).json({ message: '📧 Code de confirmation envoyé à votre email' });
  } catch (err) {
    console.error(err);
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

app.post('/verify', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email et code requis' });

  try {
    const entry = await Email.findOne({ address: email });

    if (!entry) return res.status(404).json({ error: 'E-mail non trouvé' });
    if (entry.verified) return res.status(400).json({ error: 'Déjà vérifié' });
    if (entry.confirmationCode !== code) return res.status(401).json({ error: 'Code incorrect' });

    entry.verified = true;
    entry.confirmationCode = undefined; // Supprime le code
    await entry.save();

    res.status(200).json({ message: '✅ E-mail vérifié avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '❌ Erreur lors de la vérification' });
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`);
});
