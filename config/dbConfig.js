// config/dbConfig.js
const dbConfig = {
    user: 'YOUR_SQL_USERNAME',
    password: 'YOUR_SQL_PASSWORD',
    server: 'localhost', // or your server's IP address
    database: 'YOUR_DATABASE_NAME',
    options: {
    encrypt: true, // or false, depending on your SQL Server setup
    trustServerCertificate: true // or false, depending on your SQL Server setup
    }
   };
   
  
   module.exports = dbConfig;