const $ = id => document.getElementById(id);

let usuario = JSON.parse(localStorage.getItem('usuario'));
let filmes = [];

const esc = txt => String(txt).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- filmes ----------
async function carregarFilmes() {
    try {
        const r = await fetch('/api/filmes?id_usuario=' + (usuario ? usuario.id_usuario : ''));
        if (!r.ok) throw new Error(`O servidor respondeu com erro ${r.status}`);

        filmes = await r.json();
        desenharFilmes();
        desenharMeusFilmes();
    } catch (erro) {
        console.error('Não foi possível carregar os filmes:', erro);
        $('sessao').textContent = 'Não foi possível carregar os filmes. Verifique se o servidor e o banco StreamFlix estão conectados.';
    }
}

function desenharFilmes() {
    const texto = $('inputBusca').value.trim().toLowerCase().replace('@', '');
    const lista = filmes.filter(f =>
        f.titulo_filme.toLowerCase().includes(texto) || f.admin.toLowerCase().includes(texto)
    );

    $('sessao').innerHTML = lista.length ? lista.map(f => `
        <div class="card">
            <div class="capa-box">
                <img class="capa" src="../${esc(f.url_capa)}" alt="${esc(f.titulo_filme)}">
                <div class="tooltip">
                    <div>Cadastrado por: @${esc(f.admin)}</div>
                    <div>Gênero: ${esc(f.genero)}</div>
                </div>
            </div>
            <div class="info">
                <span class="nome">${esc(f.titulo_filme)}</span>
                <button class="curtir" data-id="${f.id_filme}">
                    <span class="coracao ${f.curtido ? 'curtido' : ''}"></span>
                    <span>${f.curtidas}</span>
                </button>
            </div>
        </div>`).join('') : '<p class="vazio">Nenhum filme encontrado</p>';
}

function desenharMeusFilmes() {
    if (!usuario) return;
    $('meusFilmes').innerHTML = filmes
        .filter(f => f.id_usuario === usuario.id_usuario)
        .map(f => `
            <div class="meu-filme">
                <span>${esc(f.titulo_filme)}</span>
                <button class="lixeira" data-id="${f.id_filme}" aria-label="Excluir"></button>
            </div>`).join('');
}

$('sessao').addEventListener('click', async e => {
    const botao = e.target.closest('.curtir');
    if (!botao) return;
    if (!usuario) return abrirLogin();

    await fetch('/api/curtidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_usuario: usuario.id_usuario, id_filme: botao.dataset.id })
    });
    carregarFilmes(); // atualiza as contagens
});

// ---------- busca ----------
$('inputBusca').addEventListener('focus', () => {
    if (!usuario) {
        $('inputBusca').blur();
        abrirLogin();
    }
});
$('inputBusca').addEventListener('input', desenharFilmes);

// ---------- login ----------
function abrirLogin() {
    ['erroUsuario', 'erroSenha', 'erroLogin'].forEach(id => $(id).textContent = '');
    $('modalLogin').classList.remove('oculto');
    $('modalLogin').showModal();
}

function fecharLogin() {
    $('modalLogin').close();
    $('modalLogin').classList.add('oculto');
}

$('btnLogin').addEventListener('click', () => {
    if (usuario) {
        // logout
        localStorage.removeItem('usuario');
        location.href = 'index.html';
    } else {
        abrirLogin();
    }
});
$('fecharModal').addEventListener('click', fecharLogin);
$('btnCancelar').addEventListener('click', fecharLogin);

$('btnConfirmarLogin').addEventListener('click', async () => {
    const nome_usuario = $('loginUsuario').value.trim();
    const senha = $('loginSenha').value;

    $('erroUsuario').textContent = nome_usuario.length < 3 ? 'O nome_usuario deve ter no mínimo 3 caracteres' : '';
    $('erroSenha').textContent = senha === '' ? 'A senha é obrigatória' : '';
    $('erroLogin').textContent = '';
    if (nome_usuario.length < 3 || senha === '') return;

    try {
        const r = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome_usuario, senha })
        });

        if (r.status === 401) {
            $('erroLogin').textContent = 'Usuário ou senha incorretos';
            return;
        }
        if (!r.ok) {
            throw new Error(`O servidor respondeu com erro ${r.status}`);
        }

        usuario = await r.json();
        localStorage.setItem('usuario', JSON.stringify(usuario));
        $('loginSenha').value = '';
        fecharLogin();
        atualizarTela();
        carregarFilmes();
    } catch (erro) {
        console.error('Falha ao fazer login:', erro);
        $('erroLogin').textContent = 'Não foi possível conectar ao servidor/banco. Verifique se o servidor está iniciado.';
    }
});

function atualizarTela() {
    if (!usuario) return;
    $('userSection').classList.remove('oculto');
    $('fotoPerfil').src = '../imagens/perfil/' + usuario.imagem_usuario;
    $('nomeUsuario').textContent = usuario.nome;
    $('btnVerPerfil').disabled = usuario.tipo !== 'administrador';
    $('btnLogin').textContent = 'Logout';
}

// ---------- menu lateral (administrador) ----------
$('btnVerPerfil').addEventListener('click', async () => {
    const r = await fetch('/api/perfil/' + usuario.id_usuario);
    const perfil = await r.json();
    $('menuFoto').src = '../imagens/perfil/' + usuario.imagem_usuario;
    $('menuNome').textContent = usuario.nome;
    $('menuLikes').textContent = perfil.likes;
    $('menuFilmes').textContent = perfil.filmes;
    $('menuLateral').classList.remove('oculto');
});
$('fecharMenu').addEventListener('click', () => $('menuLateral').classList.add('oculto'));

// ---------- cadastro de filmes ----------
function mostrarRegistro(mostrar) {
    document.querySelectorAll('.busca, main > .titulo, #sessao').forEach(el => el.classList.toggle('oculto', mostrar));
    $('registro').classList.toggle('oculto', !mostrar);
}

$('btnSeusFilmes').addEventListener('click', () => {
    $('menuLateral').classList.add('oculto');
    mostrarRegistro(true);
    carregarFilmes();
});
$('btnVoltar').addEventListener('click', () => mostrarRegistro(false));

$('capaFilme').addEventListener('change', () => {
    const arquivo = $('capaFilme').files[0];
    $('nomeArquivo').textContent = arquivo ? arquivo.name : 'Nenhum arquivo escolhido';
});

$('btnCadastrar').addEventListener('click', async () => {
    const titulo = $('tituloFilme').value.trim();
    const genero = $('generoFilme').value.trim();
    const capa = $('capaFilme').files[0];

    $('erroTitulo').textContent = titulo ? '' : 'O título do filme é obrigatório';
    $('erroGenero').textContent = genero ? '' : 'O gênero é obrigatório';

    if (!capa) {
        $('erroCapa').textContent = 'A capa é obrigatória';
    } else if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(capa.name)) {
        $('erroCapa').textContent = 'Formatos aceitos: JPG, JPEG, PNG, GIF e WEBP';
    } else {
        $('erroCapa').textContent = '';
    }

    if ($('erroTitulo').textContent || $('erroGenero').textContent || $('erroCapa').textContent) return;

    const dados = new FormData();
    dados.append('titulo_filme', titulo);
    dados.append('genero', genero);
    dados.append('id_usuario', usuario.id_usuario);
    dados.append('capa', capa);
    await fetch('/api/filmes', { method: 'POST', body: dados });

    $('tituloFilme').value = '';
    $('generoFilme').value = '';
    $('capaFilme').value = '';
    $('nomeArquivo').textContent = 'Nenhum arquivo escolhido';
    carregarFilmes();
});

$('meusFilmes').addEventListener('click', async e => {
    const botao = e.target.closest('.lixeira');
    if (!botao) return;
    await fetch('/api/filmes/' + botao.dataset.id, { method: 'DELETE' });
    carregarFilmes();
});


atualizarTela();
carregarFilmes();
