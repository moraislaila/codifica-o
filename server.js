const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');

const app = express();
const frontendPath = path.join(__dirname, 'frontend');
const capasPath = path.join(__dirname, 'imagens', 'capas');
const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.PGHOST || 'localhost',
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || 'senai',
            database: process.env.PGDATABASE || "StreamFlix",
        },
);

fs.mkdirSync(capasPath, { recursive: true });

const storage = multer.diskStorage({
    destination: capasPath,
    filename: (req, file, callback) => {
        callback(null, `${Date.now()}${path.extname(file.originalname).toLowerCase()}`);
    },
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(frontendPath));
app.use('/imagens', express.static(path.join(__dirname, 'imagens')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

app.get('/api/filmes', async (req, res) => {
    const idUsuario = req.query.id_usuario || null;
    const { rows } = await pool.query(
        `SELECT f.id_filme, f.titulo_filme, f.genero, f.url_capa, f.id_usuario,
                u.nome_usuario AS admin,
                COUNT(c.id_curtida)::int AS curtidas,
                COALESCE(BOOL_OR(c.id_usuario = $1::int), false) AS curtido
         FROM tb_filme f
         JOIN tb_usuario u ON u.id_usuario = f.id_usuario
         LEFT JOIN tb_curtida c ON c.id_filme = f.id_filme
         GROUP BY f.id_filme, u.nome_usuario
         ORDER BY f.created_at DESC`,
        [idUsuario],
    );
    res.json(rows);
});

app.post('/api/login', async (req, res) => {
    const { nome_usuario, senha } = req.body;
    const { rows } = await pool.query(
        `SELECT id_usuario, nome, nome_usuario, email, imagem_usuario, tipo
         FROM tb_usuario WHERE nome_usuario = $1 AND senha = $2`,
        [nome_usuario, senha],
    );
    if (!rows.length) {
        return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
    }
    res.json(rows[0]);
});

app.post('/api/curtidas', async (req, res) => {
    const { id_usuario, id_filme } = req.body;
    if (!Number.isInteger(Number(id_usuario)) || !Number.isInteger(Number(id_filme))) {
        return res.status(400).json({ erro: 'Usuário e filme inválidos' });
    }

    const existente = await pool.query(
        'SELECT id_curtida FROM tb_curtida WHERE id_usuario = $1 AND id_filme = $2',
        [id_usuario, id_filme],
    );
    if (existente.rowCount) {
        await pool.query('DELETE FROM tb_curtida WHERE id_usuario = $1 AND id_filme = $2', [id_usuario, id_filme]);
    } else {
        await pool.query('INSERT INTO tb_curtida (id_usuario, id_filme) VALUES ($1, $2)', [id_usuario, id_filme]);
    }
    res.json({ ok: true });
});

app.get('/api/perfil/:id', async (req, res) => {
    const { rows } = await pool.query(
        `SELECT COUNT(DISTINCT f.id_filme)::int AS filmes,
                COUNT(c.id_curtida)::int AS likes
         FROM tb_filme f
         LEFT JOIN tb_curtida c ON c.id_filme = f.id_filme
         WHERE f.id_usuario = $1`,
        [req.params.id],
    );
    res.json(rows[0]);
});

app.post('/api/filmes', upload.single('capa'), async (req, res) => {
    const { titulo_filme, genero, id_usuario } = req.body;
    if (!req.file) return res.status(400).json({ erro: 'A capa é obrigatória' });
    if (!titulo_filme || !genero || !id_usuario) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ erro: 'Título, gênero e usuário são obrigatórios' });
    }

    const { rows } = await pool.query(
        `INSERT INTO tb_filme (titulo_filme, genero, url_capa, id_usuario)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [titulo_filme, genero, `imagens/capas/${req.file.filename}`, id_usuario],
    );
    res.status(201).json(rows[0]);
});

app.delete('/api/filmes/:id', async (req, res) => {
    await pool.query('DELETE FROM tb_curtida WHERE id_filme = $1', [req.params.id]);
    const { rowCount } = await pool.query('DELETE FROM tb_filme WHERE id_filme = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ erro: 'Filme não encontrado' });
    res.json({ ok: true });
});

async function importarUsuarios() {
    const csvPath = path.join(__dirname, 'anexos', 'usuarios.csv');
    if (!fs.existsSync(csvPath)) {
        throw new Error(`Arquivo de usuários não encontrado: ${csvPath}`);
    }

    const linhas = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
    const colunas = linhas.shift().split(',');
    const indices = ['nome', 'nome_usuario', 'email', 'senha', 'imagem_usuario', 'tipo']
        .map(coluna => colunas.indexOf(coluna));
    if (indices.some(indice => indice < 0)) {
        throw new Error('O CSV de usuários não contém as colunas esperadas.');
    }

    for (const linha of linhas) {
        if (!linha.trim()) continue;
        const valores = linha.split(',');
        const usuario = indices.map(indice => valores[indice]);
        await pool.query(
            `INSERT INTO tb_usuario (nome, nome_usuario, email, senha, imagem_usuario, tipo)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (email) DO NOTHING`,
            usuario,
        );
    }
}

app.use((err, req, res, next) => {
    console.error('Erro na requisição:', err);
    res.status(500).json({ erro: 'Erro interno no servidor' });
});

async function iniciarServidor() {
    if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
        throw new Error('Configure DATABASE_URL (ou PGPASSWORD) no arquivo .env.');
    }
    await pool.query('SELECT 1');
    await pool.query(
        `SELECT f.id_filme
         FROM tb_filme f
         JOIN tb_usuario u ON u.id_usuario = f.id_usuario
         LEFT JOIN tb_curtida c ON c.id_filme = f.id_filme
         LIMIT 0`,
    );
    await importarUsuarios();
    app.listen(Number(process.env.PORT || 3000), () => {
        console.log(`Servidor conectado ao banco StreamFlix em http://localhost:${process.env.PORT || 3000}`);
    });
}

iniciarServidor()
    .catch(async erro => {
        console.error('Não foi possível iniciar o servidor/banco:', erro.message);
        await pool.end();
        process.exitCode = 1;
    });
