// (provisoire) gestion de la garde — remplacée par le système d'interventions
export class Garde {
  constructor(ctx) { Object.assign(this, ctx); }
  async charger() {}
  commencer() { this.hud.mission('Disponible', this.monde.caserne.nom, 'En attente d\'un départ…', null); }
  piloteCamera() { return false; }
  touche() { return false; }
  maj() {}
}
