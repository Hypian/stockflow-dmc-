require('dotenv').config();
const { query, pool } = require('./config/db');

const products = [
  // Oral Antibiotics
  { name: 'Amoxicillin 250mg', unit: 'packs', unit_price: 3000, active: true },
  { name: 'Amoxicillin 500mg', unit: 'packs', unit_price: 4500, active: true },
  { name: 'Ciprofloxacin 500mg', unit: 'packs', unit_price: 5000, active: true },
  { name: 'Azithromycin 500mg', unit: 'packs', unit_price: 6500, active: true },
  { name: 'Metronidazole 250mg', unit: 'packs', unit_price: 2500, active: true },
  { name: 'Metronidazole 500mg', unit: 'packs', unit_price: 3500, active: true },
  { name: 'Doxycycline 100mg', unit: 'packs', unit_price: 2800, active: true },
  { name: 'Erythromycin 250mg', unit: 'packs', unit_price: 4000, active: true },
  
  // Analgesics & Antipyretics
  { name: 'Paracetamol 500mg', unit: 'boxes', unit_price: 2000, active: true },
  { name: 'Paracetamol Syrup 125mg/5ml', unit: 'bottles', unit_price: 1200, active: true },
  { name: 'Ibuprofen 400mg', unit: 'packs', unit_price: 2800, active: true },
  { name: 'Diclofenac 50mg', unit: 'packs', unit_price: 3000, active: true },
  { name: 'Tramadol 50mg', unit: 'packs', unit_price: 4000, active: true },
  { name: 'Aspirin 75mg (Cardioselective)', unit: 'packs', unit_price: 1500, active: true },
  
  // Gastrointestinal & Antacids
  { name: 'Omeprazole 20mg', unit: 'packs', unit_price: 3500, active: true },
  { name: 'Ranitidine 150mg', unit: 'packs', unit_price: 2200, active: true },
  { name: 'Antacid Suspension', unit: 'bottles', unit_price: 1800, active: true },
  { name: 'ORS (Oral Rehydration Salts)', unit: 'sachets', unit_price: 200, active: true },
  { name: 'Zinc Sulfate 20mg', unit: 'packs', unit_price: 1000, active: true },
  
  // Respiratory & Allergy
  { name: 'Salbutamol Inhaler 100mcg', unit: 'pcs', unit_price: 4500, active: true },
  { name: 'Cetirizine 10mg', unit: 'packs', unit_price: 1500, active: true },
  { name: 'Prednisolone 5mg', unit: 'packs', unit_price: 2000, active: true },
  
  // Antidiabetic & Cardiovascular
  { name: 'Metformin 500mg', unit: 'packs', unit_price: 3000, active: true },
  { name: 'Amlodipine 5mg', unit: 'packs', unit_price: 2500, active: true },
  { name: 'Amlodipine 10mg', unit: 'packs', unit_price: 3500, active: true },
  { name: 'Furosemide 40mg', unit: 'packs', unit_price: 1800, active: true },
  
  // Intravenous Fluids & Injectables
  { name: 'Normal Saline (NS 0.9%) 500ml', unit: 'bottles', unit_price: 1500, active: true },
  { name: 'Ringers Lactate (RL) 500ml', unit: 'bottles', unit_price: 1800, active: true },
  { name: 'Dextrose 5% (D5W) 500ml', unit: 'bottles', unit_price: 1600, active: true },
  { name: 'Ceftriaxone 1g (Injection)', unit: 'vials', unit_price: 2500, active: true },
  
  // Medical Supplies & Consumables
  { name: 'Surgical Gloves size 6.5', unit: 'pairs', unit_price: 400, active: true },
  { name: 'Surgical Gloves size 7.0', unit: 'pairs', unit_price: 400, active: true },
  { name: 'Surgical Gloves size 7.5', unit: 'pairs', unit_price: 400, active: true },
  { name: 'Surgical Gloves size 8.0', unit: 'pairs', unit_price: 400, active: true },
  { name: 'Syringe 2ml with Needle', unit: 'pcs', unit_price: 100, active: true },
  { name: 'Syringe 5ml with Needle', unit: 'pcs', unit_price: 120, active: true },
  { name: 'Syringe 10ml with Needle', unit: 'pcs', unit_price: 150, active: true },
  { name: 'IV Cannula 18G', unit: 'pcs', unit_price: 500, active: true },
  { name: 'IV Cannula 20G', unit: 'pcs', unit_price: 500, active: true },
  { name: 'IV Cannula 22G', unit: 'pcs', unit_price: 500, active: true },
  { name: 'Gauze Swab 10x10cm', unit: 'packs', unit_price: 2200, active: true },
  { name: 'Cotton Wool 500g', unit: 'rolls', unit_price: 3500, active: true },
  { name: 'Face Mask 3-ply', unit: 'boxes', unit_price: 3000, active: true }
];

async function seed() {
  console.log('--- Starting Data Seeding ---');
  try {
    // 1. Check if we have users. If not, seed them first.
    const userCheck = await query('SELECT id FROM users LIMIT 1');
    let adminUserId = 1;
    let normalUserId = 2;
    
    if (userCheck.rows.length === 0) {
      console.log('No users found. Please run seedUsers.js first.');
      process.exit(1);
    } else {
      const adminUser = await query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      const normalUser = await query("SELECT id FROM users WHERE role = 'user' LIMIT 1");
      if (adminUser.rows.length > 0) adminUserId = adminUser.rows[0].id;
      if (normalUser.rows.length > 0) normalUserId = normalUser.rows[0].id;
    }

    // 2. Check if we have products.
    const productCheck = await query('SELECT id FROM products LIMIT 1');
    if (productCheck.rows.length > 0) {
      console.log('Products already exist in database. Skipping product seeding.');
    } else {
      console.log('Seeding products...');
      for (const p of products) {
        await query(
          'INSERT INTO products (name, unit, unit_price, active) VALUES ($1, $2, $3, $4)',
          [p.name, p.unit, p.unit_price, p.active]
        );
      }
      console.log('Products seeded successfully.');
    }

    // 3. Check if we have entries.
    const entryCheck = await query('SELECT id FROM entries LIMIT 1');
    if (entryCheck.rows.length > 0) {
      console.log('Entries already exist in database. Skipping entry seeding.');
    } else {
      console.log('Seeding entries...');
      const dbProducts = await query('SELECT id, name FROM products');
      const todayStr = new Date().toISOString().split('T')[0];
      const timeStr = '10:30:00';

      for (const p of dbProducts.rows) {
        // Let's seed a morning shift entry
        const opening = Math.floor(Math.random() * 50) + 10;
        const received = Math.floor(Math.random() * 20);
        const disbursed = Math.floor(Math.random() * 15);
        const damaged = Math.random() > 0.8 ? 1 : 0;
        const closing = opening + received - disbursed - damaged;
        const variance = 0; // expected

        await query(
          `INSERT INTO entries 
          (product_id, user_id, opening, received, disbursed, damaged, closing, variance, shift, entry_date, entry_time)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [p.id, normalUserId, opening, received, disbursed, damaged, closing, variance, 'morning', todayStr, timeStr]
        );
      }
      console.log('Entries seeded successfully.');
    }

    console.log('--- Seeding Complete ---');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
}

seed();
