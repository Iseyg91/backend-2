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
  confirmationCode: { type: String },
  unsubscribeCode: { type: String } // 👈 Nouveau champ
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
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; background-color: #f9f9fc; color: #2c2c2c; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="text-align: center;">
            <h1 style="color: #4f46e5; margin-bottom: 10px;">Bienvenue sur Project : Delta !</h1>
          </div>
      
          <p>Salut,</p>
          <p>Merci de t'être inscrit à notre newsletter ! Afin de confirmer ton adresse email, entre le code suivant dans l’application :</p>
      
          <div style="text-align: center; margin: 30px 0;">
            <span style="display: inline-block; font-size: 30px; font-weight: bold; background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 10px; letter-spacing: 2px;">
              ${confirmationCode}
            </span>
          </div>
      
          <p style="margin-top: 0;">Ce code est valide pour une durée limitée. Si tu n’es pas à l’origine de cette demande, tu peux ignorer ce message.</p>
      
          <hr style="margin: 40px 0; border: 0; border-top: 1px solid #ddd;" />
      
          <p style="font-size: 12px; color: #666; text-align: center;">
            Project : Delta • Tous droits réservés<br/>
            <a href="https://project-delta.fr" style="color: #4f46e5; text-decoration: none;">www.project-delta.fr</a>
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

    // Envoyer un e-mail de confirmation après vérification
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: '✅ Ton inscription à Project : Delta est confirmée',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; background-color: #f0fdf4; color: #14532d; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="text-align: center;">
            <h1 style="color: #16a34a; margin-bottom: 10px;">Bienvenue officiellement !</h1>
          </div>
    
          <p>Merci d’avoir confirmé ton adresse e-mail.</p>
          <p>Tu es maintenant inscrit à la newsletter de <strong>Project : Delta</strong>. Tu recevras régulièrement des infos utiles, des nouveautés et des exclusivités !</p>
    
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://project-delta.fr" style="display: inline-block; padding: 12px 24px; background-color: #16a34a; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold;">Découvrir le site</a>
          </div>
    
          <hr style="margin: 40px 0; border: 0; border-top: 1px solid #ddd;" />
    
          <p style="font-size: 12px; color: #555; text-align: center;">
            Project : Delta • Tous droits réservés<br/>
            <a href="https://project-delta.fr" style="color: #16a34a; text-decoration: none;">www.project-delta.fr</a>
          </p>
        </div>
      `
    });

    res.status(200).json({ message: '✅ E-mail vérifié avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '❌ Erreur lors de la vérification' });
  }
});

app.post('/request-unsubscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  const unsubscribeCode = crypto.randomBytes(3).toString('hex');

  try {
    const user = await Email.findOneAndUpdate(
      { address: email, verified: true },
      { unsubscribeCode },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "Adresse non trouvée ou non vérifiée" });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: '❌ Confirmation de désinscription de Project : Delta',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; background-color: #fef2f2; color: #7f1d1d; padding: 30px; border-radius: 12px;">
          <h1 style="text-align: center; color: #dc2626;">Tu souhaites te désinscrire ?</h1>
          <p>Voici le code pour confirmer ta désinscription :</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 30px; font-weight: bold; background-color: #dc2626; color: #fff; padding: 12px 24px; border-radius: 10px;">${unsubscribeCode}</span>
          </div>
          <p>Entre ce code dans le formulaire pour valider ta demande.</p>
          <p style="font-size: 12px; text-align: center;">Project : Delta - <a href="https://project-delta.fr" style="color: #dc2626;">project-delta.fr</a></p>
        </div>
      `
    });

    res.status(200).json({ message: '📧 Code de désinscription envoyé' });
  } catch (err) {
    console.error('❌ Erreur désinscription :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/confirm-unsubscribe', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email et code requis' });

  try {
    const entry = await Email.findOne({ address: email });

    if (!entry) return res.status(404).json({ error: 'E-mail non trouvé' });
    if (entry.unsubscribeCode !== code) return res.status(401).json({ error: 'Code incorrect' });

    await Email.deleteOne({ address: email });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: '📭 Tu as été désinscrit de Project : Delta',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; background-color: #f0fdfa; color: #064e3b; padding: 30px; border-radius: 12px;">
          <h1 style="text-align: center; color: #059669;">Désinscription confirmée</h1>
          <p>Ton adresse a bien été supprimée de notre base de données. Tu ne recevras plus nos e-mails.</p>
          <p style="font-size: 12px; text-align: center;">Project : Delta - <a href="https://project-delta.fr" style="color: #059669;">project-delta.fr</a></p>
        </div>
      `
    });

    res.status(200).json({ message: '✅ Désinscription confirmée et e-mail envoyé' });
  } catch (err) {
    console.error('❌ Erreur lors de la confirmation de désinscription :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`);
});
