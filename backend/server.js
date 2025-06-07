const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 3004;

// Configuration CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Connexion à PostgreSQL
const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING || "postgresql://neondb_owner:npg_LoQ5RBJjif2k@ep-still-meadow-a4hzplir-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 50000,
  connectionTimeoutMillis: 30000
});

// Test de connexion au démarrage
(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connecté à la base de données avec succès');
    client.release();
  } catch (err) {
    console.error('❌ Erreur de connexion à la base de données:', err);
    process.exit(1);
  }
})();

// Health Check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ 
      status: 'healthy',
      service: 'reservation',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

// Route principale
app.get('/', (req, res) => {
  res.json({ 
    message: 'Service de réservation opérationnel',
    routes: ['/reservations', '/trajets', '/reservations/:id/paiements']
  });
});

// Route pour créer une nouvelle réservation
app.post('/reservations', async (req, res) => {
  try {
    const { seats, trajet_id } = req.body;
    
    // Validation minimale
    if (seats === undefined || trajet_id === undefined) {
      return res.status(400).json({ 
        success: false,
        error: 'Les champs seats et trajet_id sont obligatoires' 
      });
    }

    // Vérification que le trajet existe
    const trajet = await pool.query(
      'SELECT id, depart, destination, date_depart, prix, places_disponibles FROM trajets WHERE id = $1',
      [trajet_id]
    );
    
    if (trajet.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Trajet non trouvé'
      });
    }

    // Vérification des places disponibles
    if (trajet.rows[0].places_disponibles < seats) {
      return res.status(400).json({
        success: false,
        error: 'Nombre de places insuffisant'
      });
    }

    // Insertion en base
    const result = await pool.query(
      `INSERT INTO reservations 
       (trajet_id, nombre_places, date_reservation, statut) 
       VALUES ($1, $2, NOW(), 'En attente') 
       RETURNING *`,
      [trajet_id, seats]
    );

    // Mise à jour des places disponibles
    await pool.query(
      'UPDATE trajets SET places_disponibles = places_disponibles - $1 WHERE id = $2',
      [seats, trajet_id]
    );

    // Enrichit la réponse avec les infos du trajet
    const reservationWithDetails = {
      ...result.rows[0],
      depart: trajet.rows[0].depart,
      destination: trajet.rows[0].destination,
      date_depart: trajet.rows[0].date_depart,
      prix: trajet.rows[0].prix
    };

    res.status(201).json({
      success: true,
      reservation: reservationWithDetails
    });
  } catch (error) {
    console.error('Erreur création réservation:', {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création de la réservation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Route pour lister toutes les réservations
app.get('/reservations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, t.depart, t.destination, t.date_depart, t.prix
      FROM reservations r
      LEFT JOIN trajets t ON r.trajet_id = t.id
      ORDER BY r.id DESC
    `);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Route pour les paiements d'une réservation
app.get('/reservations/:id/paiements', async (req, res) => {
  try {
    const { id } = req.params;
    
    const reservation = await pool.query(`
      SELECT r.*, t.prix 
      FROM reservations r
      JOIN trajets t ON r.trajet_id = t.id
      WHERE r.id = $1`,
      [id]
    );
    
    if (reservation.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Réservation non trouvée'
      });
    }

    const paiements = await pool.query(
      'SELECT * FROM paiements WHERE reservation_id = $1',
      [id]
    );

    const totalPaye = paiements.rows.reduce((sum, p) => sum + parseFloat(p.montant), 0);
    const montantTotal = reservation.rows[0].prix * reservation.rows[0].nombre_places;

    res.json({
      success: true,
      reservation: reservation.rows[0],
      paiements: paiements.rows,
      montant_total: montantTotal,
      total_paye: totalPaye,
      reste_a_payer: montantTotal - totalPaye
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route pour créer un paiement
app.post('/reservations/:id/paiements', async (req, res) => {
  try {
    const { id } = req.params;
    const { montant, mode_paiement } = req.body;

    if (!montant || !mode_paiement) {
      return res.status(400).json({
        success: false,
        error: 'Montant et mode de paiement requis'
      });
    }

    const newPaiement = await pool.query(
      `INSERT INTO paiements 
       (reservation_id, montant, mode_paiement, statut) 
       VALUES ($1, $2, $3, 'Complété') 
       RETURNING *`,
      [id, montant, mode_paiement]
    );

    res.status(201).json({
      success: true,
      paiement: newPaiement.rows[0]
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du paiement'
    });
  }
});

// Route pour les trajets
app.get('/trajets', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM trajets 
      ORDER BY date_depart DESC
    `);
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Gestion des erreurs globale
app.use((err, req, res, next) => {
  console.error('Erreur globale:', err);
  res.status(500).json({
    success: false,
    error: 'Erreur interne du serveur'
  });
});

// Démarrage du serveur
const server = app.listen(port, () => {
  console.log(`\n🚀 Service Réservation démarré sur http://localhost:${port}`);
  console.log('📚 Endpoints disponibles:');
  console.log(`- POST /reservations`);
  console.log(`- GET  /reservations`);
  console.log(`- GET  /reservations/:id/paiements`);
  console.log(`- POST /reservations/:id/paiements`);
  console.log(`- GET  /trajets`);
  console.log(`- GET  /health\n`);
});

// Fonction pour fermer le serveur
function closeServer() {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('Server closed');
      resolve();
    });
  });
}

module.exports = { app, pool, server, closeServer };