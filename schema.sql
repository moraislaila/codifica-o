create table tb_usuario(
	id_usuario serial primary key,
	nome varchar(100) not null,
	nome_usuario varchar(100) not null,
	email varchar(80) unique not null,
	senha varchar(100) not null,
	imagem_usuario varchar(200) not null,
	tipo varchar(100) not null,
	created_at timestamp default now(),
	update_at timestamp default now()	
);

create table tb_filme(
	id_filme serial primary key,
	titulo_filme varchar (100) NOT NULL,
	genero varchar (80) NOT NULL,
	url_capa varchar(120) NOT NULL,
	id_usuario integer NOT NULL REFERENCES tb_usuario(id_usuario),
	created_at timestamp default now(),
	update_at timestamp default now()
);

CREATE TABLE tb_curtida(
	id_curtida SERIAL PRIMARY KEY,
	id_usuario INTEGER NOT NULL,
	id_filme INTEGER NOT NULL,
CONSTRAINT fk_usuarios_curtidas FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id_usuario),
CONSTRAINT fk_filme FOREIGN KEY (id_filme) REFERENCES tb_filme(id_filme),
	created_at TIMESTAMP DEFAULT NOW(),
	update_at TIMESTAMP DEFAULT NOW()
);


