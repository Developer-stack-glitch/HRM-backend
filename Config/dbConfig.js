const mysql = require("mysql2/promise");
require("dotenv").config();

const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectTimeout: 60000,
    queueLimit: 0,
    dateStrings: true,
};

const pool = mysql.createPool(config);

const getTenantPool = (dbName) => {
    return mysql.createPool({
        ...config,
        database: dbName
    });
};

module.exports = {
    pool,
    getTenantPool,
    config
};