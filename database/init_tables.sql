-- Suppression des tables si elles existent déjà (optionnel)
DROP TABLE IF EXISTS paiements;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS trajets;

-- Création de la table des trajets
CREATE TABLE trajets (
    id SERIAL PRIMARY KEY,
    depart VARCHAR(100) NOT NULL,
    destination VARCHAR(100) NOT NULL,
    date_depart DATE NOT NULL,
    heure_depart TIME NOT NULL,
    prix DECIMAL(10, 2) NOT NULL,
    duree_voyage INTERVAL NOT NULL
);

-- Création de la table des réservations
CREATE TABLE reservations (
    id SERIAL PRIMARY KEY,
    trajet_id INTEGER REFERENCES trajets(id),
    nombre_places INTEGER NOT NULL,
    date_reservation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    statut VARCHAR(20) DEFAULT 'confirmée'
);

-- Création de la table des paiements
CREATE TABLE paiements (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL,
    montant DECIMAL(10, 2) NOT NULL,
    mode_paiement VARCHAR(50) NOT NULL,
    date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    statut VARCHAR(20) DEFAULT 'en cours'
);

-- Ajout de données de test
INSERT INTO trajets (depart, destination, date_depart, heure_depart, prix, duree_voyage) VALUES
('Tunis', 'Sousse', '2024-06-15', '08:00:00', 15.50, '2 hours'),
('Sfax', 'Gabes', '2024-06-16', '10:30:00', 10.00, '1 hour 30 minutes');

INSERT INTO reservations (trajet_id, nombre_places, statut) VALUES
(1, 2, 'confirmée'),
(2, 1, 'en attente');

INSERT INTO paiements (reservation_id, montant, mode_paiement, statut) VALUES
(1, 31.00, 'Carte bancaire', 'completé'),
(2, 10.00, 'Espèces', 'en cours');