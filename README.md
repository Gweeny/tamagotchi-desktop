# Tamagotchi Desktop — v0.4.1

Un chaton kawaii qui vit au-dessus de ta barre des tâches : tu l'adoptes, tu t'en occupes, il grandit,
tu peux le lancer d'un écran à l'autre… et chez un ami connecté au même réseau.

## Installer sur un autre PC (sans Node.js)
1. Copie `dist/Tamagotchi-Desktop-Setup-0.4.1.exe` sur l'autre PC (clé USB, partage réseau…).
2. Double-clic dessus. L'installation se fait sans droits administrateur et lance l'app.
   - Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » (l'installateur n'est pas signé) :
     clique sur « Informations complémentaires » puis « Exécuter quand même ».
3. Au premier lancement, **clique sur « Autoriser » dans la fenêtre du pare-feu Windows**, sinon vos deux PC ne se verront pas.
4. Adopte un chaton, choisis où est le PC de ton ami (gauche/droite), puis ton pseudo.

Pour désinstaller : Paramètres Windows > Applications > Tamagotchi Desktop.

## Jouer à deux
- Les deux PC doivent être sur le même réseau (même box/Wi-Fi), avec l'app ouverte.
- Clic droit sur le chat > **Ami** : ton pseudo, le côté de ton ami, la liste des amis en ligne, accepter ou non les visites.
- Lance ton chat par le bord de l'ami : il part chez lui. Chez toi, une pancarte indique où il est.
- Chez l'ami : clic droit sur le chat invité pour le caresser, le nourrir ou le renvoyer.
  Il rentre aussi si l'ami le relance par le bord d'où il est venu, après 10 min, ou si tu cliques « Faire revenir ».
- Si l'ami ferme son app pendant la visite, ton chat revient tout seul.

### On ne se voit pas ?
1. Les deux PC ont-ils la **même version** (0.4.1 ou plus) ? Réinstalle le `.exe` des deux côtés.
2. **Pare-feu** : si la fenêtre « Autoriser » a été fermée ou refusée, ouvre « Autoriser une application via le pare-feu Windows »
   et coche Tamagotchi Desktop pour « Privé » **et** « Public » (un Wi-Fi est souvent classé « Public »).
3. **Par adresse IP** : clic droit > Ami > lis « Mon adresse » sur un PC, puis sur l'autre « Ajouter un ami par son adresse IP… ».
4. Toujours rien : certains Wi-Fi (invités, école, hôtel) empêchent les appareils de se parler entre eux.
   Vérifie avec `ping <adresse de l'ami>` dans un terminal : si ça ne répond pas, essayez le partage de connexion d'un téléphone.

## Développer
Il faut Node.js (https://nodejs.org, version LTS). Dans ce dossier :

    npm install
    npm start          # lancer l'app
    npm test           # tests du moteur et du réseau
    npm run dist       # fabriquer l'installateur dans dist/

- `preview.html` (à ouvrir dans un navigateur) montre toutes les poses, expressions, robes et icônes.
- Temps accéléré : `$env:TAMA_SPEED=1440; npm start` (1 minute = 1 journée de jeu).
- Deux apps indépendantes sur le même PC (pour tester les visites) : `$env:TAMA_PROFILE="b"; npm start`
  dans un second terminal (sauvegarde séparée).
- Sauvegarde : `%APPDATA%\tamagotchi-desktop\` (`cat.json`, `settings.json`).

## Sous Kubuntu
Si le fond est noir au lieu d'être transparent : `npm start -- --enable-transparent-visuals --disable-gpu`
