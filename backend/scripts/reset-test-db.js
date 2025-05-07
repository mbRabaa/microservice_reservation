const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: { rejectUnauthorized: true },
  max: 1
});

async function reset() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`
      TRUNCATE TABLE 
        reservations, 
        paiements 
      RESTART IDENTITY CASCADE
    `);
    
    await client.query(`
      INSERT INTO trajets 
        (depart, destination, date_depart, heure_depart, prix, duree_voyage)
      VALUES 
        ('Tunis', 'Sousse', CURRENT_DATE + 1, '08:00:00', 15.50, '2 hours'),
        ('Sfax', 'Gabes', CURRENT_DATE + 2, '10:30:00', 10.00, '1 hour 30 minutes')
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

reset().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});