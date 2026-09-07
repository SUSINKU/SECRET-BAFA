# Version « page publiée »

`secret-bafa.html` est le jeu complet en un seul fichier : comptes, secrets,
votes, reveal, classement et espace animateur. Il ne parle pas au serveur Node
de la racine — il range tout dans la base partagée que claude.ai fournit à une
page publiée (`capabilities: {db: {}}`), et se met à jour en temps réel entre
les joueurs.

Design repris de la charte utips.fr : dégradé violet → magenta → pêche,
typographie Poppins embarquée dans la page (aucun appel réseau, donc valable
même sans internet), cartes blanches flottantes, boutons en pilules.

Publié à l'adresse :
https://claude.ai/code/artifact/aacf564a-7a24-4bce-821b-a267d915d228

## Deux limites à connaître

- Une page qui déclare `db` est **interne à l'organisation Claude** de son
  propriétaire : parfait pour montrer et tester le jeu, insuffisant pour faire
  entrer une vingtaine de stagiaires. Pour ça, c'est la version serveur de la
  racine qu'il faut héberger.
- La base est lisible par le navigateur : un joueur qui ouvre les outils de
  développement peut voir les secrets et les votes. Les chiffrer avec une clé
  dérivée du mot de passe animateur reste à faire.

Ouvert hors de claude.ai, le fichier s'affiche mais annonce que sa base est
indisponible : c'est voulu.
