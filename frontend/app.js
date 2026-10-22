// atalho para pegar um elemento pelo id
const $ = id => document.getElementById(id);

// usuário logado (guardado no navegador), filmes do banco e tela atual
let usuario = JSON.parse(localStorage.getItem('usuario'));
let filmes = [];
let verMeus = false; // true quando está na tela de cadastro

const json = { 'Content-Type': 'application/json' };

// troca < > & " ' por texto seguro antes de colocar no html
const esc = txt => String(txt).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');


// ---------------- filmes ----------------

// busca os filmes no banco (manda o id para saber o que o usuário curtiu)
async function carregarFilmes() {
    const resp = await fetch('/api/filmes?id_usuario=' + (usuario ? usuario.id_usuario : ''));
    filmes = await resp.json();
    mostrarFilmes();
}

// monta os cards da galeria
function mostrarFilmes() {
    let lista = filmes;
    $('erroBusca').textContent = '';

    if (verMeus) {
        // na tela de cadastro só aparecem os filmes do próprio admin
        lista = filmes.filter(f => f.id_usuario === usuario.id_usuario);
    } else {
        // na tela inicial a busca é pelo nome do administrador
        const nome = $('busca').value.trim().replace('@', '').toLowerCase();
        if (!/^\w*$/.test(nome)) {
            $('erroBusca').textContent = 'Formato inválido (exemplo: curador1)';
            return;
        }
        lista = filmes.filter(f => f.admin.toLowerCase().includes(nome));
        if (nome && !lista.length) $('erroBusca').textContent = 'Administrador não encontrado';
    }

    // cada card tem a capa, o título e o coração (ou a lixeira no cadastro)
    $('galeria').innerHTML = lista.map(f => `
        <div class="card">
            <div class="capa">
                <img src="/${esc(f.url_capa)}" alt="${esc(f.titulo_filme)}">
                ${verMeus ? '' : `<div class="dica">Cadastrado por: @${esc(f.admin)}<br>Gênero: ${esc(f.genero)}</div>`}
            </div>
            <div class="card-baixo">
                <span>${esc(f.titulo_filme)}</span>
                ${verMeus
                    ? `<button class="lixeira" data-id="${f.id_filme}"></button>`
                    : `<button class="curtir" data-id="${f.id_filme}">
                           <span class="coracao ${f.curtido ? 'curtido' : ''}"></span>${f.curtidas}
                       </button>`}
            </div>
        </div>`).join('') || '<p class="vazio">Nenhum filme encontrado</p>';
}

// clique nos botões dos cards: curtir ou excluir
$('galeria').addEventListener('click', async e => {
    const botao = e.target.closest('button');
    if (!botao) return;

    if (botao.classList.contains('curtir')) {
        if (!usuario) return abrirLogin();
        await fetch('/api/curtidas', {
            method: 'POST',
            headers: json,
            body: JSON.stringify({ id_usuario: usuario.id_usuario, id_filme: botao.dataset.id })
        });
    } else {
        await fetch('/api/filmes/' + botao.dataset.id, { method: 'DELETE' });
    }
    carregarFilmes();
});

// filtra a galeria enquanto digita (sem login abre o modal)
$('busca').addEventListener('focus', () => {
    if (!usuario) {
        $('busca').blur();
        abrirLogin();
    }
});
$('busca').addEventListener('input', mostrarFilmes);


// ---------------- login ----------------

// abre o modal com os campos e erros limpos
function abrirLogin() {
    $('loginUsuario').value = '';
    $('loginSenha').value = '';
    ['erroUsuario', 'erroSenha', 'erroLogin'].forEach(id => $(id).textContent = '');
    $('modal').showModal();
}

// botão do topo: abre o login ou faz o logout
$('btnLogin').addEventListener('click', () => {
    if (!usuario) return abrirLogin();
    localStorage.removeItem('usuario');
    location.href = '/';
});
$('fecharModal').addEventListener('click', () => $('modal').close());
$('btnCancelar').addEventListener('click', () => $('modal').close());

// valida os campos e confere usuário e senha no banco
$('btnEntrar').addEventListener('click', async () => {
    const nome_usuario = $('loginUsuario').value.trim();
    const senha = $('loginSenha').value;

    $('erroUsuario').textContent = nome_usuario.length < 3 ? 'O nome_usuario deve ter no mínimo 3 caracteres' : '';
    $('erroSenha').textContent = senha ? '' : 'A senha é obrigatória';
    $('erroLogin').textContent = '';
    if (nome_usuario.length < 3 || !senha) return;

    const resp = await fetch('/api/login', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ nome_usuario, senha })
    });
    if (!resp.ok) {
        $('erroLogin').textContent = 'Usuário não encontrado ou senha incorreta';
        return;
    }

    // deu certo: guarda o usuário, fecha o modal e atualiza a tela
    usuario = await resp.json();
    localStorage.setItem('usuario', JSON.stringify(usuario));
    $('modal').close();
    atualizarTela();
    carregarFilmes();
});

// ajusta o cabeçalho e a busca conforme o usuário logado
function atualizarTela() {
    const admin = usuario && usuario.tipo === 'administrador';

    // "Ver Perfil" só vale para administrador (usuário comum fica desabilitado)
    $('btnPerfil').disabled = Boolean(usuario) && !admin;
    $('btnPerfil').classList.toggle('desativado', !admin);

    $('busca').placeholder = usuario
        ? 'Digite o nome do administrador'
        : 'Digite o nome do administrador... ex: @curador1';
    if (!usuario) return;

    $('foto').src = '/imagens/perfil/' + usuario.imagem_usuario;
    $('nome').textContent = usuario.nome;
    $('btnLogin').textContent = 'Logout';
}


// ---------------- menu lateral ----------------

// abre o menu com a foto, o nome e os totais do administrador
$('btnPerfil').addEventListener('click', async () => {
    if (!usuario) return abrirLogin();
    const resp = await fetch('/api/perfil/' + usuario.id_usuario);
    const perfil = await resp.json();

    $('menuFoto').src = '/imagens/perfil/' + usuario.imagem_usuario;
    $('menuNome').textContent = usuario.nome;
    $('menuLikes').textContent = perfil.likes;
    $('menuFilmes').textContent = perfil.filmes;
    $('menu').hidden = false;
});
$('fecharMenu').addEventListener('click', () => $('menu').hidden = true);

// "Seus filmes" fecha o menu e abre o cadastro
$('btnSeusFilmes').addEventListener('click', () => {
    $('menu').hidden = true;
    alternarCadastro(true);
});


// ---------------- cadastro de filmes ----------------

// mostra o cadastro (com os filmes do admin) ou volta para a galeria normal
function alternarCadastro(abrir) {
    verMeus = abrir;
    $('cadastro').hidden = !abrir;
    $('areaBusca').hidden = abrir;
    mostrarFilmes();
}
$('btnVoltar').addEventListener('click', () => alternarCadastro(false));

// troca o texto ao lado do botão pelo nome do arquivo escolhido
$('capa').addEventListener('change', () => {
    const arquivo = $('capa').files[0];
    $('nomeArquivo').textContent = arquivo ? arquivo.name : 'Nenhum arquivo escolhido';
});

// valida o formulário e envia o filme com a capa
$('btnCadastrar').addEventListener('click', async () => {
    const titulo = $('titulo').value.trim();
    const genero = $('genero').value.trim();
    const capa = $('capa').files[0];

    let erroCapa = '';
    if (!capa) erroCapa = 'A capa é obrigatória';
    else if (!/\.(jpe?g|png|gif|webp)$/i.test(capa.name)) erroCapa = 'Formatos aceitos: JPG, JPEG, PNG, GIF e WEBP';

    $('erroTitulo').textContent = titulo ? '' : 'O título do filme é obrigatório';
    $('erroGenero').textContent = genero ? '' : 'O gênero é obrigatório';
    $('erroCapa').textContent = erroCapa;
    if (!titulo || !genero || erroCapa) return;

    // FormData é o formato usado para enviar arquivo
    const dados = new FormData();
    dados.append('titulo_filme', titulo);
    dados.append('genero', genero);
    dados.append('id_usuario', usuario.id_usuario);
    dados.append('capa', capa);
    await fetch('/api/filmes', { method: 'POST', body: dados });

    // limpa o formulário e atualiza a lista
    $('titulo').value = '';
    $('genero').value = '';
    $('capa').value = '';
    $('nomeArquivo').textContent = 'Nenhum arquivo escolhido';
    carregarFilmes();
});


// ---------------- início ----------------

atualizarTela();
carregarFilmes();
// atualiza as curtidas sozinho a cada 5 segundos
setInterval(carregarFilmes, 5000);