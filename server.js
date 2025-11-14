import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import fs from "fs-extra";
import bcrypt from "bcryptjs";
import path from "path";

console.log("SERVER INICIADO!");
console.log("Views em:", path.join(process.cwd(), "views"));
console.log("Public em:", path.join(process.cwd(), "public"));
console.log("Dados em:", path.join(process.cwd(), "dados"));

const app = express();
const PORT = process.env.PORT || 3000;

const pastaDados = path.join(process.cwd(), "dados");
fs.ensureDirSync(pastaDados);

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.use(express.static(path.join(process.cwd(), "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: "biblioteca123",
  resave: false,
  saveUninitialized: true
}));

async function carregarArquivo(nome) {
  const caminho = path.join(pastaDados, nome);
  if (!(await fs.pathExists(caminho))) await fs.writeJson(caminho, [], { spaces: 4 });
  return await fs.readJson(caminho);
}

async function salvarArquivo(nome, dados) {
  const caminho = path.join(pastaDados, nome);
  await fs.writeJson(caminho, dados, { spaces: 4 });
}

// ---------- ROTAS PÚBLICAS ----------
app.get("/", (req, res) => res.render("index"));

app.get("/formulario", (req, res) => res.render("formulario"));
app.post("/formulario", async (req, res) => {
  const { nome, email, mensagem } = req.body;
  const forms = await carregarArquivo("formularios.json");
  forms.push({ nome, email, mensagem, resposta: "" });
  await salvarArquivo("formularios.json", forms);
  res.render("formulario_sucesso");
});

// ---------- ROTAS USUÁRIO ----------
app.get("/cadastro_usuario", (req, res) => res.render("cadastro_usuario"));
app.post("/cadastro_usuario", async (req, res) => {
  const { nome, usuario, senha } = req.body;
  const usuarios = await carregarArquivo("usuarios.json");

  if (usuarios.some(u => u.usuario === usuario))
    return res.send("Usuário já existe!");

  const hash = await bcrypt.hash(senha, 10);
  usuarios.push({ nome, usuario, senha: hash });
  await salvarArquivo("usuarios.json", usuarios);
  res.redirect("/login_usuario");
});

app.get("/login_usuario", (req, res) => res.render("login_usuario"));
app.post("/login_usuario", async (req, res) => {
  const { usuario, senha } = req.body;
  const usuarios = await carregarArquivo("usuarios.json");
  const u = usuarios.find(u => u.usuario === usuario);

  if (!u || !(await bcrypt.compare(senha, u.senha)))
    return res.send("Usuário ou senha inválidos!");

  req.session.usuario = { nome: u.nome, usuario: u.usuario };
  res.redirect("/usuario_area");
});

app.get("/usuario_area", (req, res) => {
  if (!req.session.usuario) return res.redirect("/login_usuario");
  res.render("usuario_area", { usuario: req.session.usuario });
});

app.get("/status_usuario", async (req, res) => {
  if (!req.session.usuario) return res.redirect("/login_usuario");
  const emprestimos = await carregarArquivo("emprestimos.json");
  const meus = emprestimos.filter(e => e.usuario === req.session.usuario.usuario);
  res.render("status_usuario", { emprestimos: meus });
});

app.get("/pegar_livro", async (req, res) => {
  if (!req.session.usuario) return res.redirect("/login_usuario");
  const livros = await carregarArquivo("livros.json");
  res.render("pegar_livro", { livros });
});

app.get("/pegar_livro/:titulo", async (req, res) => {
  if (!req.session.usuario) return res.redirect("/login_usuario");
  const emprestimos = await carregarArquivo("emprestimos.json");

  emprestimos.push({
    usuario: req.session.usuario.usuario,
    titulo: req.params.titulo,
    data: new Date().toLocaleDateString("pt-BR"),
    entregue: false
  });

  await salvarArquivo("emprestimos.json", emprestimos);
  res.redirect("/status_usuario");
});

app.get("/devolver/:titulo", async (req, res) => {
  if (!req.session.usuario) return res.redirect("/login_usuario");
  const emprestimos = await carregarArquivo("emprestimos.json");

  emprestimos.forEach(e => {
    if (e.titulo === req.params.titulo && e.usuario === req.session.usuario.usuario)
      e.entregue = true;
  });

  await salvarArquivo("emprestimos.json", emprestimos);
  res.redirect("/status_usuario");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ---------- ROTAS ADMIN ----------
app.get("/login_admin", (req, res) => res.render("login_admin"));
app.post("/login_admin", (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === "admin" && senha === "admin123") {
    req.session.admin = true;
    return res.redirect("/admin_area");
  }
  res.send("Login de administrador inválido!");
});

app.get("/admin_area", (req, res) => {
  if (!req.session.admin) return res.redirect("/login_admin");
  res.render("admin_area");
});

app.get("/cadastrar_livro", (req, res) => {
  if (!req.session.admin) return res.redirect("/login_admin");
  res.render("cadastrar_livro");
});

app.post("/cadastrar_livro", async (req, res) => {
  if (!req.session.admin) return res.redirect("/login_admin");
  const livros = await carregarArquivo("livros.json");
  livros.push({ titulo: req.body.titulo, autor: req.body.autor });
  await salvarArquivo("livros.json", livros);
  res.redirect("/lista_livro");
});

app.get("/lista_livro", async (req, res) => {
  const livros = await carregarArquivo("livros.json");
  res.render("lista_livro", { livros });
});

// ✅ REMOVER LIVRO — AGORA FUNCIONANDO
app.get("/remover_livro/:titulo", async (req, res) => {
  if (!req.session.admin) return res.redirect("/login_admin");
  const livros = await carregarArquivo("livros.json");

  const filtrados = livros.filter(l => l.titulo !== req.params.titulo);

  await salvarArquivo("livros.json", filtrados);
  res.redirect("/lista_livro");
});

app.get("/emprestimos", async (req, res) => {
  if (!req.session.admin) return res.redirect("/login_admin");
  const emprestimos = await carregarArquivo("emprestimos.json");
  res.render("emprestimos", { emprestimos });
});

app.get("/ver_formularios", async (req, res) => {
  if (!req.session.admin) return res.redirect("/login_admin");
  const forms = await carregarArquivo("formularios.json");
  res.render("formularios_admin", { formularios: forms });
});

app.post("/responder/:idx", async (req, res) => {
  if (!req.session.admin) return res.redirect("/login_admin");
  const forms = await carregarArquivo("formularios.json");
  forms[req.params.idx].resposta = req.body.resposta;
  await salvarArquivo("formularios.json", forms);
  res.redirect("/ver_formularios");
});

app.get("/minhas_mensagens", async (req, res) => {
  if (!req.session.usuario) return res.redirect("/login_usuario");
  const forms = await carregarArquivo("formularios.json");
  const minhas = forms.filter(f => f.nome === req.session.usuario.nome);
  res.render("minhas_mensagens", { mensagens: minhas });
});

// ---------- 404 ----------
app.use((req, res) => res.status(404).render("404"));

app.use((err, req, res, next) => {
  console.error("Erro interno:", err);
  res.status(500).send("Erro interno do servidor.");
});

app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
