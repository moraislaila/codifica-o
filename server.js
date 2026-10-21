const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ---------- Configuração do banco ----------
const conexao = {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'Senai'
};
const NOME_BANCO = 'StreamFlix';
let pool;

async function iniciarBanco() {
    // Cria o banco se ainda não existir
    const admin = new Pool({ ...conexao, database: 'postgres' });
    const existe = await admin.query('select 1 from pg_database where datname = $1', [NOME_BANCO]);
    if (!existe.rowCount) await admin.query('create database ' + NOME_BANCO);
    await admin.end();

    pool = new Pool({ ...conexao, database: NOME_BANCO });

    // Verifica se as tabelas já existem; se não, executa o schema e a carga inicial
    const tabela = await dbQuery("select to_regclass('usuarios') as t");
    if (tabela.rows[0].t) return;

    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        await dbQuery(fs.readFileSync(schemaPath, 'utf8'));
    }

    const csvPath = path.join(__dirname, 'anexos', 'usuarios.csv');
    if (fs.existsSync(csvPath)) {
        const linhas = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).slice(1);
        for (const linha of linhas) {
            const [nome, usuario, senha, telefone, foto_perfil] = linha.split(',');
            await dbQuery(
                'insert into usuarios (nome, usuario, senha, telefone, foto_perfil) values ($1, $2, $3, $4, $5)',
                [nome, usuario, senha, telefone, foto_perfil]
            );
        }
    }
}
// ---------- Servidor ----------
const app = express();
app.use(express.json());

// Servir arquivos estáticos de forma organizada
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Configuração do multer para upload de imagens de anúncios
const storage = multer.diskStorage({
    destination: path.join(__dirname, 'public', 'uploads'),
    filename: (req, file, cb) =>
        cb(null, Date.now() + path.extname(file.originalname).toLowerCase()),
});
const upload = multer({ storage });

// ---------- Rotas da API ----------

app.get('/api/anuncios', async (req, res) => {
    const { modelo } = req.query;
    const params = [];

    let query = `
        SELECT a.id, a.titulo, a.local, a.preco, a.imagem,
               u.nome AS vendedor, u.usuario AS vendedor_usuario, u.telefone AS vendedor_telefone,
               COUNT(i.id)::int AS interesses
        FROM anuncios a
        JOIN usuarios u ON u.id = a.vendedor_id
        LEFT JOIN interesses i ON i.anuncio_id = a.id
    `;

    if (modelo) {
        params.push(`%${modelo}%`);
        query += ` WHERE a.titulo ILIKE $${params.length}`;
    }

    query += ' GROUP BY a.id, u.nome, u.usuario, u.telefone ORDER BY a.criado_em DESC';

    const { rows } = await dbQuery(query, params);
    res.json(rows);
});

app.post('/api/login', async (req, res) => {
    const { usuario, senha } = req.body;
    const { rows } = await dbQuery(
        'SELECT id, nome, usuario, telefone, foto_perfil FROM usuarios WHERE usuario = $1 AND senha = $2',
        [usuario, senha],
    );
    if (rows.length === 0) {
        return res
            .status(401)
            .json({ erro: 'Usuário não encontrado ou senha incorreta' });
    }
    res.json(rows[0]);
});

app.post('/api/interesses/:anuncioId', async (req, res) => {
    const { anuncioId } = req.params;
    const { cliente_nome, cliente_contato } = req.body;

    if (!cliente_nome || !cliente_contato) {
        return res.status(400).json({ erro: 'Nome e contato são obrigatórios' });
    }

    await dbQuery(
        'INSERT INTO interesses (anuncio_id, cliente_nome, cliente_contato) VALUES ($1, $2, $3)',
        [anuncioId, cliente_nome, cliente_contato],
    );

    const { rows } = await dbQuery(
        'SELECT COUNT(*)::int AS total FROM interesses WHERE anuncio_id = $1',
        [anuncioId],
    );
    res.json({ interesses: rows[0].total });
});

app.get('/api/perfil/:id', async (req, res) => {
    const { id } = req.params;
    const anuncios = await dbQuery(
        `
        SELECT a.id, a.titulo, a.local, a.preco, a.imagem, COUNT(i.id)::int AS interesses
        FROM anuncios a LEFT JOIN interesses i ON i.anuncio_id = a.id
        WHERE a.vendedor_id = $1 GROUP BY a.id ORDER BY a.criado_em DESC
    `,
        [id],
    );

    const totalInteresses = anuncios.rows.reduce(
        (acc, a) => acc + a.interesses,
        0,
    );

    res.json({
        totalAnuncios: anuncios.rows.length,
        totalInteresses,
        anuncios: anuncios.rows,
    });
});

app.post('/api/anuncios', upload.single('imagem'), async (req, res) => {
    const { titulo, local, preco, vendedor_id } = req.body;
    if (!req.file) return res.status(400).json({ erro: 'Imagem obrigatória' });

    const { rows } = await dbQuery(
        'INSERT INTO anuncios (titulo, local, preco, imagem, vendedor_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [titulo, local, preco, req.file.filename, vendedor_id],
    );
    res.json(rows[0]);
});

app.delete('/api/anuncios/:id', async (req, res) => {
    await dbQuery('DELETE FROM anuncios WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
});

app.post('/api/mensagens/:anuncioId', async (req, res) => {
    const { anuncioId } = req.params;
    const { cliente_nome, cliente_contato, mensagem } = req.body;

    if (!cliente_nome || !cliente_contato || !mensagem) {
        return res
            .status(400)
            .json({ erro: 'Nome, contato e mensagem são obrigatórios' });
    }

    await dbQuery(
        'INSERT INTO mensagens (anuncio_id, cliente_nome, cliente_contato, mensagem) VALUES ($1, $2, $3, $4)',
        [anuncioId, cliente_nome, cliente_contato, mensagem],
    );

    res.json({ ok: true });
});

// ---------- Inicialização ----------
iniciarBanco().then(() => {
    app.listen(3000, () =>
        console.log('Servidor rodando em http://localhost:3000')
    );
});