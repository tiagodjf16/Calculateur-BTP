function calculer() {

    const surfaceMur = parseFloat(document.getElementById("surfaceMur").value);
    const surfacePlaque = parseFloat(document.getElementById("typePlaco").value);
    const resultat = document.getElementById("resultat");

    if (isNaN(surfaceMur) || surfaceMur <= 0) {
        resultat.innerHTML = "<em>Veuillez saisir une surface valide</em>";
        return;
    }

    const surfaceAvecPerte = surfaceMur * 1.10;
    const nbPlaques = Math.ceil(surfaceAvecPerte / surfacePlaque);

    resultat.innerHTML = `
        Surface murs : ${surfaceMur} m²<br>
        Surface avec perte (10 %) : ${surfaceAvecPerte.toFixed(1)} m²<br>
        👉 Nombre de plaques à acheter : <strong>${nbPlaques}</strong>
    `;
}
