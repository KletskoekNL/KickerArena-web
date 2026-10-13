// The help page: how everything works.
import { ANDROID, TUX, WINDOWS, GLOBE, GITHUB } from './ui.js';
import { S, me, settings, isWeb, isHosted } from './store.js';
import { BADGES } from './stats.js';

const sec = (id, title, body) => `<section class="card help-sec" id="h-${id}"><h2>${title}</h2>${body}</section>`;

export function viewHelp() {
  const set = settings();
  const games = set.gamesPerMatch;
  const goals = set.scoring === 'goals';
  const parts = [
    ['start', '👋 Aan de slag', `
      <p>KickerArena houdt bij wie er tafelvoetbalt, deelt eerlijke teams in en bewaart alle uitslagen. Je kunt het op twee manieren gebruiken:</p>
      <ul>
        <li><b>De app</b>, voor Windows, Android en Linux: een eigen venster, en je krijgt een melding als je aan de beurt bent, ook buiten kantoor. Downloaden doe je op de website van de server onder <i>Instellingen</i>; daar staat per systeem hoe je hem installeert. De Windows-zip bevat de koppelcode van de server al, op Android en Linux vul je die bij de eerste start één keer in. Waarschuwt Windows met <i>"Windows heeft uw pc beschermd"</i>? Klik dan op <b>Meer info</b> → <b>Toch uitvoeren</b> (de app is niet digitaal ondertekend). Ontbreekt die knop, dan blokkeert je IT-afdeling het; de website werkt altijd.</li>
        <li><b>De website</b>: in de browser of op je telefoon, op het adres van de server op het lokale netwerk.</li>
      </ul>
      <p>De eerste keer kies je <b>wie je bent</b>. Dat wordt onthouden. Wisselen kan altijd onder <i>Instellingen → Jij → Wisselen</i>. Sta je er nog niet tussen? Kies <i>Nieuwe speler</i> en geef jezelf een naam, avatar en shirtkleur.</p>
      <p>Onder <b>Spelers</b> staat iedereen, met een groen bolletje bij wie online is. Je sorteert op naam of met de online spelers eerst; wie gestopt is staat apart onderaan.</p>`],
    ['queue', '🧍 Aanmelden en de wachtrij', `
      <p>Op de <b>Arena</b> meld je je aan voor <b>1 tegen 1</b>, <b>2 tegen 2</b> of <b>Beide</b> (maakt je niet uit). Je komt achteraan in de wachtrij. Met <i>+ Iemand anders</i> meld je ook een collega aan, en met ✕ haal je iemand uit de rij.</p>
      <p><b>Wie er speelt</b> gaat strikt op volgorde van aanmelding:</p>
      <ol>
        <li>KickerArena kijkt naar de eerste in de rij. Wil die 2 tegen 2 en staan er (vanaf die persoon) vier 2v2-spelers klaar, dan spelen de eerste vier.</li>
        <li>Lukt 2 tegen 2 nog niet en wil de eerste ook 1 tegen 1, dan wordt het die persoon tegen de eerstvolgende 1v1-speler.</li>
        <li>Kan de eerste nog niet (bijvoorbeeld: alleen 2v2 en pas drie spelers), dan mag de volgende in de rij alvast. De eerste houdt gewoon zijn plek.</li>
      </ol>
      <p>Onder <b>Volgende partij</b> zie je wie het wordt. Met <b>📣 Naar de tafel!</b> roep je de spelers op; zij krijgen een melding. Is de tafel nog bezet, dan komt de partij onder <i>Wacht op de tafel</i>.</p>
      <p><b>Pas later kunnen?</b> Kies bij het aanmelden onder <b>Wanneer?</b> een tijdstip (later vandaag). Je houdt dan je plek in de rij, maar wordt tot dat tijdstip overgeslagen: de anderen kunnen gewoon spelen. Je staat er gedimd bij met 🕐 en krijgt een melding als het zover is. Kies je alsnog <b>Nu</b>, dan doe je meteen mee.</p>
      <p><b>Opgeroepen, maar het komt niet uit?</b> Dan heb je drie knoppen (niet bij toernooiwedstrijden). Ze staan ook onderin de grote melding <i>Jij bent aan de beurt!</i>:</p>
      <ul>
        <li><b>⏳ 5 min uitstel</b>: één keer per wedstrijd. Bij de tafel loopt een klok; iemand kiest daar <b>Wachten</b> of <b>Doorgaan met</b> de eerstvolgende in de rij. Dat beslist voor iedereen, net als de aftrap. Valt er iemand in, dan worden de teams opnieuw eerlijk ingedeeld en sta jij weer op je oude plek in de rij, vanaf het einde van je uitstel. Ben je er eerder? Kies dan <b>✅ Ik kan toch al</b>; het uitstel stopt en iedereen kan naar de tafel.</li>
        <li><b>🕐 Ander tijdstip…</b>: de eerstvolgende valt meteen in en jij doet weer mee vanaf het tijdstip dat je kiest.</li>
        <li><b>✖ Ik kan niet</b>: de eerstvolgende valt in en jij gaat uit de rij.</li>
      </ul>
      <p>Staat er niemand in de rij die nu kan invallen, dan kan er alleen gewacht worden; bij <i>Ander tijdstip</i> of <i>Ik kan niet</i> gaat de wedstrijd dan niet door en krijgen de anderen hun plek in de rij terug.</p>
      <p>Na een wedstrijd sta je niet automatisch weer in de rij: wil je nog een potje, meld je dan opnieuw aan.</p>
      <p><b>Opruimen:</b> de beheerder van de server kan instellen dat wie te lang in de wachtrij staat er automatisch uit wordt gehaald, en/of dat de hele rij elke dag op een vast tijdstip (bijvoorbeeld na kantoortijd) wordt leeggemaakt. Je krijgt dan een melding.</p>`],
    ['teams', '⚖️ Eerlijke teams', `
      <p>Bij 2 tegen 2 bekijkt KickerArena de drie mogelijke indelingen van de vier gekozen spelers en kiest de indeling waarbij de <b>winkans het dichtst bij 50/50</b> ligt, op basis van ieders rating. Duo's die de laatste wedstrijden al samen speelden, krijgen een klein strafpunt, zodat de teams blijven wisselen.</p>
      <p>De winkans per spel staat bij de volgende partij en boven de tafel. Wie <b>Zwart</b> en wie <b>Wit</b> is, kun je voor de aftrap nog omdraaien met <i>⇄ Kleuren wisselen</i>.</p>
      <p><b>De sterkste kleur.</b> Wint één kleur aan jullie tafel duidelijk vaker dan de andere, dan krijgt het team met de kleinste winkans die kleur. Dat gebeurt pas na 200 gespeelde spellen en alleen als het verschil groter is dan toeval kan verklaren; tot dan bepaalt de volgorde van aanmelden wie Zwart is. De winkans en de rating veranderen er niet door. Het staat erbij onder <i>Volgende partij</i> als de regel is toegepast.</p>`],
    ['match', '🏟️ Een wedstrijd spelen', `
      <p>Op <b>DE TAFEL</b> spelen de poppetjes ondertussen zelf een potje, zonder te scoren. Voer je een goal of een gewonnen spel in, dan schiet een speler de bal alsnog in het doel en zie je de goal vallen.</p>
      <p>Een wedstrijd bestaat uit <b>${games} ${games === 1 ? 'spel' : 'spellen'}</b> (in te stellen onder <i>Instellingen → Spelregels</i>). Druk op <b>🎬 Aftrap</b> als jullie beginnen; dat mag ook overgeslagen worden.</p>
      <p>De uitslag wordt ${goals ? '<b>per goal</b> bijgehouden' : '<b>per spel</b> bijgehouden'} (ook in te stellen bij Spelregels):</p>
      <ul>
        <li><b>Per spel de winnaar</b>: na elk spel druk je op <b>Zwart wint</b> of <b>Wit wint</b>. Scoorden de verliezers niet? Zet dan eerst <b>🐌 Kruipen</b> aan: zij moeten onder de tafel door, en het telt iets zwaarder mee voor de rating.</li>
        <li><b>Goals live</b>: druk bij elke goal op <b>GOAL ZWART</b> of <b>GOAL WIT</b>; iedereen ziet de stand meebewegen. Een spel is uit bij ${set.goalsToWin} goals. Met ↶ Zwart / ↶ Wit draai je een goal terug.</li>
      </ul>
      <p><b>Vergissing?</b> <i>↶ Vorig spel</i> haalt het laatst ingevoerde spel weer weg.</p>
      <p><b>Geen tijd meer?</b> Met <b>✔ Afronden na spel …</b> stop je: de gespeelde spellen tellen mee, de rest vervalt. Druk je op <b>✖ Annuleren</b> terwijl er al gespeeld is, dan kies je: alleen de open spellen annuleren (gespeelde tellen mee) of de hele wedstrijd annuleren (dan telt niets en gaan de spelers terug in de wachtrij).</p>
      <p><b>Tafelmodus</b> (⛶ rechtsboven de tafel) laat het scorebord groot zien, handig op een tablet naast de tafel.</p>
      <p><b>Staat de tafel stil?</b> Op de tafel spelen de poppetjes normaal een potje. Vraagt je apparaat om minder beweging (in Windows: <i>Animatie-effecten</i> uit, ook vaak op een server of via extern bureaublad), dan staat hij stil. Onder <i>Instellingen → Jij</i> zet je de <b>bewegende tafel</b> aan of uit.</p>`],
    ['rating', '📈 Rating en ranglijst', `
      <p>Iedereen begint op <b>1000</b>, met een aparte rating voor 1 tegen 1 en 2 tegen 2. Na elk gespeeld spel gaan de winnaars omhoog en de verliezers omlaag (Elo-systeem). In het kort:</p>
      <ul>
        <li>Win je van sterkere tegenstanders, dan krijg je er meer bij dan andersom.</li>
        <li>Een grote overwinning (kruipen, of een groot doelsaldo als je goals bijhoudt) telt iets zwaarder.</li>
        <li>Nieuwe spelers (minder dan 10 spellen) bewegen sneller, zodat ze snel op hun niveau zitten. Ze staan als <i>nieuw</i> op de ranglijst.</li>
        <li>In 2 tegen 2 telt de gemiddelde rating van het team.</li>
        <li>Spelen twee even sterke teams 1-1 gelijk, dan blijft iedereen precies staan waar hij stond.</li>
      </ul>
      <details><summary><b>Zo wordt het precies berekend</b></summary>
        <p><b>1. De winkans.</b> Bij het begin van de wedstrijd berekent KickerArena de kans dat elk team een spel wint, uit het verschil in rating (in 2 tegen 2: het gemiddelde van de twee spelers):</p>
        <p class="formula">winkans = 1 / (1 + 10<sup>(rating tegenstander − eigen rating) / 400</sup>)</p>
        <p>Gelijke ratings geven 50%. Ben je 100 punten sterker, dan is je winkans 64%; bij 200 punten 76%. Dit is ook de winkans die je bij een wedstrijd ziet.</p>
        <p><b>2. Per spel.</b> Na elk spel verandert je rating met:</p>
        <p class="formula">K × factor × (uitslag − winkans)</p>
        <ul>
          <li><b>uitslag</b> is 1 als je het spel wint en 0 als je het verliest.</li>
          <li><b>K</b> is 20, of 32 voor wie in deze spelvorm nog geen 10 spellen heeft gespeeld.</li>
          <li><b>factor</b> is normaal 1, en 1,25 bij kruipen 🐌. Houd je goals bij, dan hangt hij af van het doelsaldo: 0,75 + 0,5 × doelsaldo ÷ score van de winnaar. 10-0 geeft 1,25, 10-5 geeft 1,0 en 10-9 geeft 0,8.</li>
        </ul>
        <p>De winkans en K liggen vast vanaf het begin van de wedstrijd, ook als er tussendoor een spel gewonnen is. De volgorde van de spellen maakt dus niets uit.</p>
        <p><b>Voorbeelden</b> (K = 20, zonder kruipen):</p>
        <ul>
          <li>1000 tegen 1000: de winnaar van een spel krijgt <b>+10</b>, de verliezer <b>−10</b>. Bij 1-1 kom je dus op 0 uit.</li>
          <li>1100 tegen 1000: de favoriet heeft 64% winkans. Wint hij een spel, dan is dat <b>+7,2</b>; verliest hij er een, dan <b>−12,8</b>. Bij 1-1 verliest de favoriet dus 5,6 punten en wint de underdog er 5,6. Van de favoriet werd immers meer verwacht.</li>
        </ul>
        <p>In 2 tegen 2 krijgen beide spelers van een team dezelfde verandering, behalve als een van de twee nog <i>nieuw</i> is (die heeft K = 32).</p>
      </details>
      <p><b>De ranglijst</b> staat op volgorde van rating, apart voor 2 tegen 2 en 1 tegen 1. Je staat erop zodra je in die spelvorm een spel hebt gespeeld. Toernooiwedstrijden tellen gewoon mee. De rating wordt ook gebruikt om eerlijke teams te maken.</p>
      <p>1 tegen 1 en 2 tegen 2 zijn twee aparte competities. Ook je <b>vorm</b> (de bolletjes met je laatste spellen) en je <b>reeks</b> (🔥 gewonnen of 🥶 verloren op rij) worden per spelvorm bijgehouden: een verloren duel breekt je 2-tegen-2-reeks niet.</p>
      <p>Wordt een oude uitslag aangepast of verwijderd, dan rekent KickerArena alle ratings opnieuw uit: alle wedstrijden worden op volgorde van tijd opnieuw doorgerekend.</p>`],
    ['tourney', '🏅 Toernooien', `
      <p>Onder <b>Toernooi</b> start je een toernooi. Er loopt er altijd hooguit één tegelijk. Je kiest:</p>
      <ul>
        <li><b>Vaste teams (knock-out)</b>: wie verliest ligt eruit, tot er één team over is. KickerArena maakt de teams zelf eerlijk (de sterkste speler met de zwakste) en zet de favorieten zo dat ze elkaar pas laat tegenkomen. Bij een oneven aantal teams krijgen de sterksten een vrije ronde.</li>
        <li><b>Wisselende teams (rondes)</b>: een aantal rondes; elke ronde worden nieuwe wedstrijden ingedeeld, met spelers met een vergelijkbare stand en zo weinig mogelijk dezelfde partner. Een gewonnen wedstrijd is een punt; wie na de laatste ronde de meeste punten heeft, wint. Zijn er spelers over, dan zit telkens iemand anders een ronde uit.</li>
        <li><b>Wedstrijdlengte</b>: in een toernooi moet elke wedstrijd een winnaar hebben. Bij <i>1 spel</i> beslist één spel, bij <i>best of 3</i> speel je door tot een team 2 spellen heeft gewonnen, bij <i>best of 5</i> tot 3.</li>
      </ul>
      <p>Iedereen meldt zich aan met <b>Ik doe mee</b> (of je voegt spelers toe). Na <b>Start toernooi</b> verschijnt de volgende toernooiwedstrijd op de Arena; roep hem op met <b>Naar de tafel!</b> en speel hem zoals altijd. Toernooiwedstrijden tellen ook mee voor de rating. Een toernooi dat je afbreekt voordat er een wedstrijd is gespeeld, verdwijnt gewoon weer en telt niet mee. Na afloop zie je de <b>eindstand</b> met ieders plaats; eerdere toernooien staan eronder.</p>`],
    ['history', '📜 Historie aanpassen', `
      <p>Onder <b>Historie</b> staan alle wedstrijden, per dag, met de ratingwijziging per speler. Met ✏️ pas je een uitslag aan (per spel de winnaar, en desgewenst de score), met 🗑️ verwijder je een wedstrijd.</p>
      <p>Een wedstrijd gespeeld zonder de wachtrij? <b>📝 Wedstrijd invoeren</b> zet hem er alsnog in, ook met een datum in het verleden.</p>`],
    ['fame', '🏛️ Hall of Fame en badges', `
      <p>De <b>Hall of Fame</b> toont de records: koning van de tafel, langste winstreak, grootste verrassing, de sterkste kleur, gouden duo's en de kruiphoek. Op je eigen <b>profiel</b> (klik op je naam) staan je statistieken, ratinggrafiek, beste maatje, nemesis en badges. Er zijn er ${BADGES.length}: voor wie veel wint, voor wie vooral veel speelt, en voor wie het vaak nét niet haalt. De meeste houd je voor altijd; een paar (zoals <i>Koning van de tafel</i> en <i>Bodemschat</i>) heb je zolang je op die plek staat. Reeksen tellen binnen één spelvorm.</p>
      <div class="badges help-badges">${BADGES.map((b) => `<div class="badge"><span class="ic">${b.ic}</span><div><b>${b.name}</b><small>${b.desc}</small></div></div>`).join('')}</div>`],
    ['notify', '🔔 Meldingen en geluid', `
      <p>Word je opgeroepen, dan verschijnt er een grote melding met geluid. In de app krijg je bovendien een melding van je systeem (Windows, Android of Linux), ook als het venster op de achtergrond staat; op Windows knippert KickerArena ook in de taakbalk. Dezelfde melding krijg je als het tijdstip aanbreekt waarop je wilde meedoen. Op Linux blijft de app daarom draaien als je het venster sluit; afsluiten doe je onder <i>Instellingen</i>. Het geluid (goal, fluitje, fanfare) zet je aan of uit onder <i>Instellingen → Jij</i>.</p>`],
    ['box', '🎛️ Knoppendoos bij de tafel', `
      <p>Bij de tafel kan een <b>knoppendoos</b> staan: een doosje met twee knoppen en een klein display dat je zelf maakt (de beheerder vindt de bouwbeschrijving bij de server). Het toont wie er speelt en de stand. De linkerknop hoort bij het team dat links op het display staat.</p>
      <ul>
        <li><b>Tellen per potje</b>: houd de knop van het winnende team ingedrukt en kies daarna <i>Gewoon</i> of <i>Kruipen!</i></li>
        <li><b>Tellen per goal</b>: een korte druk is een goal; ingedrukt houden draait de laatste goal van die kant terug.</li>
        <li><b>Beide knoppen ingedrukt houden</b>: de aftrap van een opgeroepen wedstrijd. Tijdens de wedstrijd draai je er het laatste potje mee terug.</li>
      </ul>
      <p>Alles wat je op het doosje doet zie je meteen in de apps, en andersom.</p>`],
    ['net', '📡 Verbinding en privacy', `
      <p>De server en de apps praten met elkaar via vier gratis, publieke internetdiensten (MQTT-brokers), alle vier tegelijk: zolang er één werkt, werkt KickerArena. Er hoeven geen poorten open; alles gaat via uitgaand internet. Alle berichten zijn <b>versleuteld</b>: de brokers zien alleen onleesbare data.</p>
      <p>Server en apps vinden elkaar met de <b>koppelcode</b> (zoiets als <code>K7XQ-3MWD-9HTA</code>). De server maakt die zelf, één keer. De zip van de website bevat de code al (in <code>KickerArena.koppelcode</code>, naast de exe); de Android- en Linux-app en een app die je op een andere manier hebt gekregen vragen er de eerste keer om en onthouden hem (op Android kun je de QR-code scannen). De code staat in het beheervenster van de server en op de website onder <i>Instellingen</i>. Uit de code wordt de sleutel én de naam van het kanaal berekend, dus meerdere servers kunnen naast elkaar werken zonder elkaar te zien.</p>
      <p>De <b>webapp</b> is dezelfde interface als gewone webpagina op internet, voor wie geen app kan of wil installeren (ook op een iPhone of iPad). ${isHosted ? 'Die gebruik je nu. ' : ''}Hij praat net als de apps via de brokers met de server. De koppelcode wordt in de browser onthouden: op een gedeelde computer wis je hem met <i>Instellingen → Verbinding → Vergeten</i>. Met de QR-code daar zet je de webapp gekoppeld op een ander apparaat. Via het menu van je browser (<i>Installeren</i> of <i>Zet op beginscherm</i>) opent hij als een app.</p>
      <p>De <b>website</b> komt rechtstreeks van de server op het lokale netwerk. ${isWeb ? 'Herstart de server, dan maakt deze pagina vanzelf opnieuw verbinding.' : ''} Bovenin zie je de status: <i>Live · 4/4 brokers</i> betekent dat alles goed is. Alleen de brokers waar de server ook op zit tellen mee.</p>
      <p>De server draait op één pc en heeft een eigen <b>beheerscherm</b>: wie er verbonden is, de website-instellingen, back-ups (elke dag automatisch) en export en import van alle gegevens, bijvoorbeeld om naar een nieuwe versie over te stappen.</p>`],
    ['server', '🖥️ Beheer van de server', `
      <p>Het beheer (verbonden apps, back-ups, import en export, instellingen) staat in het venster van de server. Alle serverinstellingen staan daar en zijn alleen daar te wijzigen, nooit vanuit een app of de website.</p>
      <ul>
        <li><b>Beheer vanaf een andere pc</b>: met een eigen poort en een beheerwachtwoord. Het gaat over gewoon http op het lokale netwerk, dus gebruik het alleen op een netwerk dat je vertrouwt.</li>
        <li><b>Als service</b>: de server start dan vanzelf met de computer (Windows-service of systemd op Linux). Het beheer open je dan met het beheerwachtwoord: op de servercomputer via <code>http://localhost:47829</code>, en vanaf een andere computer via het adres van de server met de poort die je bij <b>Beheer via het netwerk</b> hebt ingesteld.</li>
        <li><b>Beheer in de browser</b>: je blijft aangemeld als de server herstart, en de pagina maakt dan vanzelf weer verbinding.</li>
        <li><b>Webapp op internet</b>: de server onthoudt het adres van de eerste webapp die verbinding maakt; spelers zien het bij <i>Instellingen → Website</i>. Onder <i>Instellingen</i> vul je zo nodig een ander adres in.</li>
        <li><b>Verbonden</b>: in het overzicht zie je per verbinding wat het is: ${WINDOWS} Windows-app, ${ANDROID} Android-app, ${TUX} Linux-app, ${GITHUB} webapp, ${GLOBE} browser of 🎛️ knoppendoos.</li>
        <li><b>Logboek</b>: elke actie komt erin met de naam van wie hem deed en over wie het gaat. Het wordt standaard 90 dagen bewaard; dat is instelbaar.</li>
      </ul>`],
    ['faq', '💡 Vragen en tips', `
      <details><summary><b>Bovenin staat "Zoekt de server…"</b></summary><p>Je app vindt de server niet. Draait <i>KickerArena-Server</i> op de server-pc, en heeft die internet? Klopt de koppelcode? Controleer die onder <i>Instellingen → Verbinding → Wijzigen</i> en vergelijk met de code in het beheervenster van de server. Een app met de verkeerde code ziet de server nooit; na 25 seconden krijg je de keuze om opnieuw te proberen, een andere code in te vullen of af te sluiten. Zodra alles klopt, gaat het vanzelf verder.</p></details>
      <details><summary><b>De koppelcode is kwijt of moet veranderen</b></summary><p>De code staat op de website van de server (<i>Instellingen</i>) en in het beheervenster. Een nieuwe code, bijvoorbeeld omdat de oude is uitgelekt? In het beheervenster, bij de koppelcode: <b>Nieuwe code…</b>. De oude code werkt dan meteen niet meer. Iedereen downloadt de app opnieuw of vult de nieuwe code in bij <i>Instellingen → Verbinding → Wijzigen</i>; wie de website van de server gebruikt merkt er niets van.</p></details>
      <details><summary><b>Hoe wissel ik van speler?</b></summary><p>Onder <i>Instellingen → Jij → Wisselen</i>. Kies <i>Alleen kijken</i> als je niet meespeelt.</p></details>
      <details><summary><b>Wie mag uitslagen aanpassen?</b></summary><p>Iedereen. Er zit geen wachtwoord op: het is van en voor het team. Elke wijziging komt in het logboek van de server, en de server maakt elke dag een back-up.</p></details>
      <details><summary><b>Iemand is weg terwijl hij opgeroepen is</b></summary><p>Wie is opgeroepen kan zelf <b>5 min uitstel</b> vragen, een <b>ander tijdstip</b> kiezen of <b>Ik kan niet</b> aangeven; dan valt de eerstvolgende in de rij in (zie <i>Aanmelden en de wachtrij</i>). Reageert iemand helemaal niet, annuleer dan de wedstrijd: de spelers komen terug op hun oude plek in de wachtrij. Haal de afwezige eruit met ✕.</p></details>
      <details><summary><b>Kan ik op mijn telefoon meedoen?</b></summary><p>Ja. Met de Android-app (downloaden via <i>Instellingen</i> op de website), via de website van de server op het lokale netwerk, of met de webapp als je beheerder die heeft klaargezet (ook op een iPhone). Alles werkt daar hetzelfde.</p></details>`],
  ];
  if (S.state?.feedback) parts.push(['melden', '📮 Probleem of idee melden', reportForm()]);
  return `<h1 class="page">❓ Help <small>hoe KickerArena werkt</small></h1>
    <div class="help">
      <nav class="card help-toc"><h2>📚 Inhoud</h2>${parts.map(([id, t]) => `<a href="#/help" data-jump="h-${id}">${t}</a>`).join('')}</nav>
      <div class="help-body">${parts.map(([id, t, b]) => sec(id, t, b)).join('')}</div>
    </div>`;
}

// A report goes to the server, which turns it into a GitHub issue. The
// fields are data-static so a live update does not wipe what was typed.
function reportForm() {
  if (!me()) return '<p>Kies eerst wie je bent (<i>Instellingen → Jij</i>), dan kun je hier een probleem of idee melden.</p>';
  return `<p>Werkt er iets niet, of heb je een idee? Laat het hier weten. Je melding komt bij de beheerder terecht, met je naam en je versie van KickerArena erbij.</p>
    <form data-form="report" class="col report">
      <div class="row kinds">
        <label class="kind"><input type="radio" name="kind" value="bug" data-static checked> 🐞 Er werkt iets niet</label>
        <label class="kind"><input type="radio" name="kind" value="idea" data-static> 💡 Idee of wens</label>
      </div>
      <label class="f">Titel <input type="text" name="title" maxlength="100" data-static placeholder="Kort, bijvoorbeeld: de wachtrij doet raar na een goal"></label>
      <label class="f">Wat gebeurde er, of wat zou je willen? <textarea name="text" rows="5" maxlength="4000" data-static placeholder="Wat deed je, wat verwachtte je en wat gebeurde er?"></textarea></label>
      <div class="row"><button class="btn primary" type="submit">📮 Versturen</button></div>
    </form>`;
}
