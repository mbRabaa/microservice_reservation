
-- Création de la base de données
CREATE DATABASE reservation_db;

-- Se connecter à la base de données
\c reservation_db;

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
