#!/usr/bin/env node
/**
 * Mevcut sorulara optionD (4. seçenek) ekler.
 * Kullanım: npm run migrate:option-d  (quizbackend klasöründen)
 */
try { require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); } catch (_) {}

const { sequelize } = require('../src/database/config');
const { seedQuestions } = require('../src/database/seed.js');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Veritabanı bağlantısı OK.');

    try {
      await sequelize.query('ALTER TABLE questions ADD COLUMN optionD VARCHAR(255) NULL');
      console.log('optionD sütunu eklendi.');
    } catch (e) {
      /* Sütun zaten varsa devam */
    }

    const seedMap = Object.fromEntries(
      (seedQuestions || []).filter((s) => s.optionD).map((s) => [s.questionKey, s.optionD])
    );

    const [rows] = await sequelize.query(
      "SELECT id, questionKey FROM questions WHERE optionD IS NULL OR optionD = ''"
    );

    let updated = 0;
    for (const row of rows) {
      const optionD = seedMap[row.questionKey] || 'Hiçbiri';
      await sequelize.query('UPDATE questions SET optionD = ? WHERE id = ?', {
        replacements: [optionD, row.id],
      });
      updated++;
    }

    console.log(`${updated} soruya 4. seçenek (D) eklendi.`);
  } catch (err) {
    console.error('Hata:', err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();
