// server.js
const express = require('express');
const path = require('path');
const { createTableIfNotExists, pool } = require('./database'); // we'll extend database.js below

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Minimal server-side validation (same rules as the form)
function onlyLettersOrNumbers(value) { return /^[A-Za-z0-9]+$/.test(value); }
function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function onlyDigits(value) { return /^\d+$/.test(value); }
function isAlphanumeric(value) { return /^[A-Za-z0-9]+$/.test(value); }
function startsWithNumber(value) { return /^[0-9]/.test(value); }

function validateForm(body) {
  const errors = [];
  const fv = v => (typeof v === 'string' ? v.trim() : '');

  const first_name = fv(body.first_name);
  const second_name = fv(body.second_name);
  const email = fv(body.email);
  const phone = fv(body.phone);
  const eircode = fv(body.eircode);

  if (!first_name) errors.push({ field: 'first_name', msg: 'First name required' });
  else if (first_name.length > 20) errors.push({ field: 'first_name', msg: 'Max 20 characters' });
  else if (!onlyLettersOrNumbers(first_name)) errors.push({ field: 'first_name', msg: 'Only letters and numbers allowed' });

  if (!second_name) errors.push({ field: 'second_name', msg: 'Second name required' });
  else if (second_name.length > 20) errors.push({ field: 'second_name', msg: 'Max 20 characters' });
  else if (!onlyLettersOrNumbers(second_name)) errors.push({ field: 'second_name', msg: 'Only letters and numbers allowed' });

  if (!email) errors.push({ field: 'email', msg: 'Email required' });
  else if (!isValidEmail(email)) errors.push({ field: 'email', msg: 'Invalid email' });

  if (!phone) errors.push({ field: 'phone', msg: 'Phone required' });
  else if (!onlyDigits(phone)) errors.push({ field: 'phone', msg: 'Phone must contain only numbers' });
  else if (phone.length !== 10) errors.push({ field: 'phone', msg: 'Phone must be exactly 10 digits' });

  if (!eircode) errors.push({ field: 'eircode', msg: 'Eircode required' });
  else if (eircode.length !== 6) errors.push({ field: 'eircode', msg: 'Eircode must be exactly 6 characters' });
  else if (!startsWithNumber(eircode)) errors.push({ field: 'eircode', msg: 'Eircode must start with a number' });
  else if (!isAlphanumeric(eircode)) errors.push({ field: 'eircode', msg: 'Eircode must be alphanumeric' });

  return { errors, values: { first_name, second_name, email, phone, eircode } };
}

// ensure form table exists (create typed table if necessary)
// We will call createFormTableIfNotExists (added in database.js below)
const { createFormTableIfNotExists, insertFormRow } = require('./database');

app.post('/submit', async (req, res) => {
  try {
    // ensure table schema exists before saving
    await createFormTableIfNotExists();

    // validate payload
    const { errors, values } = validateForm(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    // insert safely
    await insertFormRow(values);
    return res.status(201).json({ message: 'Inserted' });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// serve the form at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
