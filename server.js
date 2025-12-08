// server.js (updated for Part C: middleware & request handling)
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const {
  createFormTableIfNotExists,
  insertFormRow,
  pool
} = require('./database'); // from your database.js

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Basic middleware (Security and request)
app.use(helmet()); // sets many useful security headers
app.use(express.json({ limit: '100kb' })); // limit JSON body size
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// request logger
app.use(morgan('combined'));

// rate limiter from spam
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 60 sec window
  max: 60,                 // limit each IP to 60 requests per windows
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Middleware to ensure database
async function ensureFormTableExists(req, res, next) {
  try {
    await createFormTableIfNotExists();
    return next();
  } catch (err) {
    console.error('Error ensuring form table exists:', err);
    // don't leak internal detail to client
    return res.status(500).json({ message: 'Server database error' });
  }
}

// Simple validator with the rules for Client-Side
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

//Checking Endpoints
app.get('/health', async (req, res) => {
  try {
    // check DB connectivity
    const conn = await pool.getConnection();
    try {
      await conn.ping();
    } finally {
      conn.release();
    }
    return res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    console.error('Health check DB error:', err);
    return res.status(500).json({ status: 'error', db: 'down' });
  }
});

// Submiting routes using middleware making sure the schema exists
app.post('/submit', ensureFormTableExists, async (req, res) => {
  try {
    const { errors, values } = validateForm(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    // insert database.js uses parameterized queries
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

// Error handler (FALLBACK)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Unexpected server error' });
});

//Test database connection and port availability
async function startServer() {
  try {
    // database check
    const conn = await pool.getConnection();
    try {
      await conn.ping();
      console.log('DB connection OK');
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Unable to connect to database on startup:', err.message || err);
    console.error('Server will not start until DB is reachable.');
    process.exit(1); // fail fast for assignment environment
  }

  // start listen
  const server = app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
  });

  // catch EADDRINUSE (port already in use)
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Choose another port or stop the process using it.`);
      process.exit(1);
    } else {
      console.error('Server error', err);
      process.exit(1);
    }
  });

  // shutdown handlers
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
  });
}

startServer();
app.use(express.static(path.join(__dirname, 'public')));