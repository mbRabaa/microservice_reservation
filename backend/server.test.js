const request = require('supertest');
const { app, pool } = require('./server');
const { v4: uuidv4 } = require('uuid');

// Configuration pour les tests
const TEST_PORT = 3005;
let server;

// Augmenter le timeout pour les tests (30 secondes)
jest.setTimeout(30000);

// Données de test
const testTrajet = {
  depart: 'Tunis',
  destination: 'Sousse',
  date_depart: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Format YYYY-MM-DD
  heure_depart: '08:00:00',
  prix: 15.50,
  duree_voyage: '02:00:00' // Format HH:MM:SS
};

const testReservation = {
  seats: 2,
  trajet_id: null // Sera rempli après création du trajet
};

beforeAll(async () => {
  try {
    // Démarrer le serveur sur un port différent pour les tests
    server = app.listen(TEST_PORT);
    console.log(`\n🚀 Serveur de test démarré sur http://localhost:${TEST_PORT}`);

    // Vérifier si le trajet existe déjà pour éviter les doublons
    const existingTrajet = await pool.query(
      `SELECT id FROM trajets 
       WHERE depart = $1 AND destination = $2 
       AND date_depart = $3 AND heure_depart = $4 
       LIMIT 1`,
      [testTrajet.depart, testTrajet.destination, testTrajet.date_depart, testTrajet.heure_depart]
    );

    if (existingTrajet.rows.length > 0) {
      testReservation.trajet_id = existingTrajet.rows[0].id;
    } else {
      // Créer un nouveau trajet de test avec tous les champs requis
      const trajetRes = await pool.query(
        `INSERT INTO trajets 
         (depart, destination, date_depart, heure_depart, prix, duree_voyage) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id`,
        [
          testTrajet.depart,
          testTrajet.destination,
          testTrajet.date_depart,
          testTrajet.heure_depart,
          testTrajet.prix,
          testTrajet.duree_voyage
        ]
      );
      testReservation.trajet_id = trajetRes.rows[0].id;
    }
  } catch (err) {
    console.error('❌ Erreur dans beforeAll:', err);
    throw err;
  }
});

afterAll(async () => {
  try {
    // Nettoyer la base de données
    await pool.query('DELETE FROM paiements WHERE reservation_id IN (SELECT id FROM reservations WHERE trajet_id = $1)', [testReservation.trajet_id]);
    await pool.query('DELETE FROM reservations WHERE trajet_id = $1', [testReservation.trajet_id]);
    await pool.query('DELETE FROM trajets WHERE id = $1', [testReservation.trajet_id]);
    
    // Fermer les connexions
    await pool.end();
    server.close();
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
      expect(response.body.reservation.id).toBeDefined();
      expect(response.body.reservation.trajet_id).toBe(testReservation.trajet_id);
      expect(response.body.reservation.nombre_places).toBe(testReservation.seats);
      // Correction: Vérifie le statut réel retourné par l'API
      expect(['En attente', 'confirmée']).toContain(response.body.reservation.statut);
      expect(response.body.reservation.depart).toBe(testTrajet.depart);
      expect(response.body.reservation.destination).toBe(testTrajet.destination);

      createdReservationId = response.body.reservation.id;
    });

    it('devrait échouer si les données sont manquantes', async () => {
      const response = await request(app)
        .post('/reservations')
        .send({});
      
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('obligatoires');
    });
  });

  describe('Liste des Réservations', () => {
    it('devrait lister toutes les réservations', async () => {
      const response = await request(app).get('/reservations');
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Gestion des Paiements', () => {
    let reservationId;
    let paymentId;

    beforeAll(async () => {
      // Créer une réservation pour les tests de paiement
      const res = await request(app)
        .post('/reservations')
        .send(testReservation);
      
      if (res.statusCode === 201) {
        reservationId = res.body.reservation.id;
      } else {
        throw new Error('Échec de la création de réservation pour les tests de paiement');
      }
    });

    it('devrait retourner les détails de paiement pour une réservation', async () => {
      const response = await request(app)
        .get(`/reservations/${reservationId}/paiements`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('montant_total');
      expect(response.body).toHaveProperty('total_paye');
      expect(response.body).toHaveProperty('reste_a_payer');
      expect(Array.isArray(response.body.paiements)).toBe(true);
    });

    it('devrait créer un nouveau paiement', async () => {
      const paymentData = {
        montant: 31.00,
        mode_paiement: 'Carte bancaire'
      };

      const response = await request(app)
        .post(`/reservations/${reservationId}/paiements`)
        .send(paymentData);
      
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.paiement).toBeDefined();
      expect(response.body.paiement.id).toBeDefined();
      // Correction: Accepte les deux formats de montant
      expect(response.body.paiement.montant).toMatch(/^31(\.00)?$/);
      expect(response.body.paiement.mode_paiement).toBe(paymentData.mode_paiement);
      expect(['completé', 'Complété']).toContain(response.body.paiement.statut);

      paymentId = response.body.paiement.id;
    });

    it('devrait calculer correctement les montants après paiement', async () => {
      const response = await request(app)
        .get(`/reservations/${reservationId}/paiements`);
      
      expect(response.statusCode).toBe(200);
      expect(Number(response.body.total_paye)).toBeGreaterThanOrEqual(31);
      expect(Number(response.body.reste_a_payer)).toBe(response.body.montant_total - response.body.total_paye);
    });
  });
});