# 🌊 ECO RIDER — Multiplayer

Jogo de plataforma 2D multiplayer. Dois celulares jogam ao mesmo tempo pela rede local Wi-Fi.

## ✅ REQUISITOS
- Node.js instalado no computador (https://nodejs.org)
- Dois celulares na mesma rede Wi-Fi que o computador

## 🚀 COMO RODAR

### 1. Inicie o servidor
```bash
node server.js
```
O terminal mostrará algo como:
```
╔══════════════════════════════════════════════╗
║  Local:   http://localhost:3000              ║
║  Rede:    http://192.168.1.10:3000           ║
╚══════════════════════════════════════════════╝
```

### 2. Nos dois celulares
- Conecte os dois celulares ao **mesmo Wi-Fi** do computador
- Abra o navegador (Chrome recomendado)
- Acesse: `http://192.168.1.10:3000` (use o IP mostrado no terminal)

### 3. Crie/Entre na sala
- Defina um **código de sala** igual nos dois celulares (ex: `ECO01`)
- **Celular 1** toca em **💎 BOY**
- **Celular 2** toca em **💎 GIRL**
- Quando os dois entrarem, o jogo começa automaticamente!

## 🎮 CONTROLES

| Jogador | Botões na tela |
|---------|---------------|
| BOY  💎 (azul)  | ◀ ▲ ▶ na tela |
| GIRL 💎 (rosa) | ◀ ▲ ▶ na tela |

## 📋 REGRAS
- BOY coleta **diamantes azuis** 💎
- GIRL coleta **diamantes rosas** 💎
- Se qualquer personagem **cair** ou tocar em **óleo/espinhos** → Game Over
- 3 fases para completar a missão!

## 🌐 JOGAR NA INTERNET (opcional)
Para jogar pela internet (não só Wi-Fi local):
1. Use um serviço como **ngrok**: `ngrok http 3000`
2. Compartilhe o link gerado com o outro jogador

## 📁 ESTRUTURA
```
ecorider-multiplayer/
├── server.js          ← Servidor Node.js (WebSocket puro, sem dependências)
├── public/
│   ├── index.html     ← Jogo completo (HTML + Canvas + JS)
│   └── img/           ← Imagens do jogo
└── README.md
```
