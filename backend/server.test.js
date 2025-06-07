const request = require('supertest');
const { app, pool, server: mainServer, closeServer: closeMainServer } = require('./server');
const { v4: uuidv4 } = require('uuid');

// Configuration pour les tests
const TEST_PORT = 3005;
let testServer;

// Augmenter le timeout pour les tests
jest.setTimeout(30000);

// Données de test
const testTrajet = {
  depart: 'Tunis',
  destination: 'Sousse',
  date_depart: new Date(Date.now() + 86400000).toISOString().split('T')[0],
  heure_depart: '08:00:00',
  prix: 15.50,
  duree_voyage: '02:00:00',
  places_disponibles: 50
};

const testReservation = {
  seats: 2,
  trajet_id: null
};

// Fonction utilitaire pour fermer proprement les serveurs
const closeTestServer = (server) => {
  return new Promise((resolve, reject) => {
    if (server && server.listening) {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
};

beforeAll(async () => {
  try {
    // Démarrer le serveur de test
    testServer = app.listen(TEST_PORT);
    console.log(`\n🚀 Serveur de test démarré sur http://localhost:${TEST_PORT}`);

    // Créer un trajet de test avec toutes les colonnes requises
    const trajetRes = await pool.query(
      `INSERT INTO trajets 
       (depart, destination, date_depart, heure_depart, prix, duree_voyage, places_disponibles) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id`,
      [
        testTrajet.depart,
        testTrajet.destination,
        testTrajet.date_depart,
        testTrajet.heure_depart,
        testTrajet.prix,
        testTrajet.duree_voyage,
        testTrajet.places_disponibles
      ]
    );
    testReservation.trajet_id = trajetRes.rows[0].id;
  } catch (err) {
    console.error('❌ Erreur dans beforeAll:', err);
    throw err;
  }
});

afterAll(async () => {
  try {
    // Nettoyer la base de données
    if (testReservation.trajet_id) {
      await pool.query('DELETE FROM paiements WHERE reservation_id IN (SELECT id FROM reservations WHERE trajet_id = $1)', [testReservation.trajet_id]);
      await pool.query('DELETE FROM reservations WHERE trajet_id = $1', [testReservation.trajet_id]);
      await pool.query('DELETE FROM trajets WHERE id = $1', [testReservation.trajet_id]);
    }

    // Fermer le pool de connexions PostgreSQL
    if (pool) {
      await pool.end();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Fermer les serveurs
    await closeTestServer(testServer);
    await closeMainServer();

    console.log('✅ Nettoyage après tests terminé');
  } catch (err) {
    console.error('❌ Erreur dans afterAll:', err);
  }
});

describe('Service de Réservation', () => {
  describe('Health Check', () => {
    it('devrait retourner un statut healthy', async () => {
      const response = await request(app).get('/health');
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('reservation');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Routes des Trajets', () => {
    it('devrait lister les trajets', async () => {
      const response = await request(app).get('/trajets');
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('devrait inclure les places disponibles dans les résultats', async () => {
      const response = await request(app).get('/trajets');
      const trajet = response.body.data.find(t => t.id === testReservation.trajet_id);
      expect(trajet).toBeDefined();
      expect(trajet.places_disponibles).toBeDefined();
      expect(trajet.places_disponibles).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Création de Réservation', () => {
    let createdReservationId;

    it('devrait créer une nouvelle réservation', async () => {
      const response = await request(app)
        .post('/reservations')
        .send(testReservation);
      
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.reservation).toBeDefined();
      
      createdReservationId = response.body.reservation.id;
      
      // Vérification que les places disponibles ont bien changé
      const trajetResponse = await pool.query(
        'SELECT places_disponibles FROM trajets WHERE id = $1',
        [testReservation.trajet_id]
      );
      expect(parseInt(trajetResponse.rows[0].places_disponibles)).toBe(testTrajet.places_disponibles - testReservation.seats);
    });

    it('devrait échouer si les données sont manquantes', async () => {
      const response = await request(app)
        .post('/reservations')
        .send({});
      
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/obligatoires/i);
    });
  });

  describe('Liste des Réservations', () => {
    it('devrait lister toutes les réservations', async () => {
      const response = await request(app).get('/reservations');
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
});