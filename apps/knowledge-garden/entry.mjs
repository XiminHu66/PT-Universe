const canonical='https://pt-vps-tools.h1nano.chatgpt.site/knowledge/';
if(location.origin!==new URL(canonical).origin){location.replace(canonical+location.search);}else{await import('./app.mjs?v=semantic-hub-20261026');}
