const { expect } = require('chai');
const request = require('supertest');
const app = require('../server');

describe('Microservice Réservation - Tests API', function() {
  // Augmentez le timeout pour les tests de base de données
  this.timeout(10000);

  let testTrajetId;
  let testReservationId;

  before(async () => {
    // Vérifiez que la base de données contient des données de test
    const trajets = await request(app).get('/trajets');
    if (trajets.body.data.length === 0) {
      throw new Error('Aucun trajet trouvé dans la base de données');
    }
    testTrajetId = trajets.body.data[0].id;
  });

  describe('Health Check', () => {
    it('GET /health devrait retourner un statut healthy', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      expect(res.body).to.have.property('status', 'healthy');
    });
  });

  describe('Routes Principales', () => {
    it('GET / devrait retourner le message de bienvenue', async () => {
      const res = await request(app)
        .get('/')
        .expect(200);
      
      expect(res.body).to.have.property('message', 'Service de réservation opérationnel');
    });
  });

  describe('Gestion des Trajets', () => {
    it('GET /trajets devrait retourner une liste de trajets', async () => {
      const res = await request(app)
        .get('/trajets')
        .expect(200);
      
      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.be.an('array');
      expect(res.body.data.length).to.be.greaterThan(0);
    });
  });

  describe('Gestion des Réservations', () => {
    it('POST /reservations devrait créer une nouvelle réservation', async () => {
      const res = await request(app)
        .post('/reservations')
        .send({ seats: 2, trajet_id: testTrajetId })
        .expect(201);
      
      expect(res.body).to.have.property('success', true);
      expect(res.body.reservation).to.have.property('id');
      testReservationId = res.body.reservation.id;
    });

    it('GET /reservations devrait lister les réservations', async () => {
      const res = await request(app)
        .get('/reservations')
        .expect(200);
      
      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.be.an('array');
    });
  });

  describe('Gestion des Paiements', () => {
    it('POST /reservations/:id/paiements devrait créer un paiement', async () => {
      if (!testReservationId) {
        console.warn('Aucune réservation créée, test ignoré');
        return;
      }

      const res = await request(app)
        .post(`/reservations/${testReservationId}/paiements`)
        .send({ montant: 30.00, mode_paiement: 'Carte Bancaire' })
        .expect(201);
      
      expect(res.body).to.have.property('success', true);
      expect(res.body.paiement).to.have.property('id');
    });

    it('GET /reservations/:id/paiements devrait lister les paiements', async () => {
      if (!testReservationId) {
        console.warn('Aucune réservation créée, test ignoré');
        return;
      }

      const res = await request(app)
        .get(`/reservations/${testReservationId}/paiements`)
        .expect(200);
      
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('paiements');
    });
  });
});