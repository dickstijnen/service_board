'use strict';

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const APP_DIR = path.resolve(__dirname, '..');

async function seed() {
  const { createStrapi } = require('@strapi/strapi');

  const app = createStrapi({
    appDir: APP_DIR,
    distDir: path.join(APP_DIR, 'dist'),
  });

  await app.load();
  console.log('✓ Strapi geladen\n');

  const { entityService, db } = app;

  // ── 1. Chauffeur users ──────────────────────────────────────────
  const role = await db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'authenticated' } });

  const chauffeurDefs = [
    { username: 'admin',        email: 'info@paterbak.nl',         password: 'Admin123!',   firstname: 'Beheer', lastname: 'Paterbak', rol: 'admin'      },
    { username: 'jan_devries',  email: 'jan.devries@paterbak.nl',  password: 'Chauffeur1!', firstname: 'Jan',  lastname: 'de Vries', rol: 'chauffeur'    },
    { username: 'piet_bakker',  email: 'piet.bakker@paterbak.nl',  password: 'Chauffeur1!', firstname: 'Piet', lastname: 'Bakker',   rol: 'chauffeur'    },
    { username: 'kees_jansen',  email: 'kees.jansen@paterbak.nl',  password: 'Chauffeur1!', firstname: 'Kees', lastname: 'Jansen',   rol: 'chauffeur'    },
  ];

  const chauffeurs = [];
  for (const c of chauffeurDefs) {
    const hash = await bcrypt.hash(c.password, 10);
    const user = await db.query('plugin::users-permissions.user').create({
      data: {
        username:  c.username,
        email:     c.email,
        password:  hash,
        // provider MUST be 'local' — /api/auth/local filters on it; without it login returns "Invalid identifier or password"
        provider:  'local',
        rol:       c.rol,
        confirmed: true,
        blocked:   false,
        role:      role.id,
      },
    });
    chauffeurs.push(user);
    console.log(`  + ${c.rol === 'admin' ? 'Admin' : 'Chauffeur'} ${c.firstname} ${c.lastname} (${c.email})`);
  }
  console.log(`✓ ${chauffeurs.length} users (1 admin + ${chauffeurs.length - 1} chauffeurs)\n`);

  // ── 2. Klanten (15) ────────────────────────────────────────────
  const klantenDefs = [
    { bedrijfsnaam: 'Bouwbedrijf Hendriks BV',       voornaam: 'Marc',  achternaam: 'Hendriks',      telefoon: '0612345678', email: 'marc@hendriks-bouw.nl',        straat: 'Industrieweg',   huisnummer: '14',  postcode: '5688AB', plaatsnaam: 'Oirschot',             btw_nummer: 'NL823456789B01', kvk_nummer: '12345678' },
    { bedrijfsnaam: 'Sloopbedrijf Van der Berg',      voornaam: 'Erik',  achternaam: 'van der Berg',  telefoon: '0623456789', email: 'erik@sloopberg.nl',            straat: 'Molenlaan',      huisnummer: '3',   postcode: '5641CD', plaatsnaam: 'Eindhoven',            kvk_nummer: '23456789' },
    { bedrijfsnaam: null,                             voornaam: 'Petra', achternaam: 'Visser',        telefoon: '0634567890', email: 'petra.visser@gmail.com',       straat: 'Kastanjelaan',   huisnummer: '22',  postcode: '5651EF', plaatsnaam: 'Eindhoven' },
    { bedrijfsnaam: 'Aannemersbedrijf De Groot',      voornaam: 'Hans',  achternaam: 'de Groot',      telefoon: '0645678901', email: 'info@degroot-aannemer.nl',     straat: 'Kerkstraat',     huisnummer: '8',   postcode: '5462GH', plaatsnaam: 'Veghel',               btw_nummer: 'NL834567890B01', kvk_nummer: '34567890' },
    { bedrijfsnaam: null,                             voornaam: 'Sophie',achternaam: 'Martens',       telefoon: '0656789012', email: 'sophie.martens@hotmail.com',   straat: 'Dorpstraat',     huisnummer: '45A', postcode: '5481IJ', plaatsnaam: 'Schijndel' },
    { bedrijfsnaam: 'Groenservice Peeters',           voornaam: 'Luc',   achternaam: 'Peeters',       telefoon: '0667890123', email: 'luc@groenservicepeeters.nl',   straat: 'Groeneweg',      huisnummer: '7',   postcode: '5271KL', plaatsnaam: 'Sint-Michielsgestel',  kvk_nummer: '45678901' },
    { bedrijfsnaam: null,                             voornaam: 'Tom',   achternaam: 'Smeets',        telefoon: '0678901234', email: 'tom.smeets@gmail.com',         straat: 'Heidestraat',    huisnummer: '12',  postcode: '5431MN', plaatsnaam: 'Cuijk' },
    { bedrijfsnaam: 'Renovatiebedrijf Willems',       voornaam: 'Frank', achternaam: 'Willems',       telefoon: '0689012345', email: 'frank@willems-renovatie.nl',   straat: 'Nieuwstraat',    huisnummer: '33',  postcode: '5701OP', plaatsnaam: 'Helmond',              btw_nummer: 'NL845678901B01', kvk_nummer: '56789012' },
    { bedrijfsnaam: null,                             voornaam: 'Anna',  achternaam: 'Kooijman',      telefoon: '0690123456', email: 'anna.kooijman@gmail.com',      straat: 'Boslaan',        huisnummer: '5',   postcode: '5631QR', plaatsnaam: 'Eindhoven' },
    { bedrijfsnaam: 'Tuin & Bestrating Kuijpers',     voornaam: 'Rick',  achternaam: 'Kuijpers',      telefoon: '0601234567', email: 'rick@kuijpers-tuin.nl',        straat: 'Tuinstraat',     huisnummer: '1',   postcode: '5664ST', plaatsnaam: 'Geldrop',              kvk_nummer: '67890123' },
    { bedrijfsnaam: null,                             voornaam: 'Lisa',  achternaam: 'Hermans',       telefoon: '0612345679', email: 'lisa.hermans@outlook.com',     straat: 'Veldweg',        huisnummer: '9',   postcode: '5473UV', plaatsnaam: 'Heeswijk' },
    { bedrijfsnaam: 'Dak & Gevel Janssen',            voornaam: 'Wim',   achternaam: 'Janssen',       telefoon: '0623456780', email: 'wim@dakgevel-janssen.nl',      straat: 'Daklaan',        huisnummer: '6',   postcode: '5611WX', plaatsnaam: 'Eindhoven',            btw_nummer: 'NL856789012B01', kvk_nummer: '78901234' },
    { bedrijfsnaam: null,                             voornaam: 'Bas',   achternaam: 'van den Heuvel',telefoon: '0634567891', email: 'bas.heuvel@gmail.com',         straat: 'Heuvellaan',     huisnummer: '18',  postcode: '5491YZ', plaatsnaam: 'Sint-Oedenrode' },
    { bedrijfsnaam: 'Bouwmarkt Claessen',             voornaam: 'Rik',   achternaam: 'Claessen',      telefoon: '0645678902', email: 'rik@claessen-bouwmarkt.nl',    straat: 'Handelskade',    huisnummer: '21',  postcode: '5683AB', plaatsnaam: 'Best',                 kvk_nummer: '89012345' },
    { bedrijfsnaam: null,                             voornaam: 'Noor',  achternaam: 'Lammers',       telefoon: '0656789013', email: 'noor.lammers@gmail.com',       straat: 'Molenstraat',    huisnummer: '3B',  postcode: '5521CD', plaatsnaam: 'Eersel' },
  ];

  const klanten = [];
  for (const k of klantenDefs) {
    const klant = await entityService.create('api::klant.klant', { data: k });
    klanten.push(klant);
  }
  console.log(`✓ ${klanten.length} klanten\n`);

  // ── 3. Containers (5) ──────────────────────────────────────────
  const containerDefs = [
    { code: 'BAK-001', formaat: 'c3m3',  status: 'geplaatst',   huidige_locatie_adres: 'Industrieweg 14, Oirschot' },
    { code: 'BAK-002', formaat: 'c6m3',  status: 'beschikbaar', huidige_locatie_adres: null },
    { code: 'BAK-003', formaat: 'c9m3',  status: 'onderweg',    huidige_locatie_adres: 'Kerkstraat 8, Veghel' },
    { code: 'BAK-004', formaat: 'c1m3',  status: 'beschikbaar', huidige_locatie_adres: null },
    { code: 'BAK-005', formaat: 'c20m3', status: 'beschikbaar', huidige_locatie_adres: null },
  ];

  const containers = [];
  for (let i = 0; i < containerDefs.length; i++) {
    const def = containerDefs[i];
    const c = await entityService.create('api::container.container', {
      data: {
        container_code:        def.code,
        formaat:               def.formaat,
        status:                def.status,
        type_omschrijving:     `Container ${def.formaat.replace('c', '').toUpperCase()}`,
        huidige_locatie_adres: def.huidige_locatie_adres,
        qr_code_data:          `CONTAINER:${crypto.randomUUID()}`,
      },
    });
    containers.push(c);
    console.log(`  + Container ${def.formaat} [${def.status}]`);
  }
  console.log(`✓ ${containers.length} containers\n`);

  // ── 4. Tarieven (7 formaten × 5 afvalsoorten = 35) ─────────────
  const formaten   = ['c1m3', 'c3m3', 'c6m3', 'c9m3', 'c9m3-g', 'c20m3', 'c40m3'];
  const afvalsoorten = ['puin', 'afval', 'hout', 'grond', 'groen'];

  const basisprijs = { 'c1m3': 125, 'c3m3': 185, 'c6m3': 250, 'c9m3': 320, 'c9m3-g': 355, 'c20m3': 490, 'c40m3': 740 };
  const afvalFactor = { puin: 1.20, afval: 1.00, hout: 0.90, grond: 1.10, groen: 0.85 };

  let tariefCount = 0;
  for (const formaat of formaten) {
    for (const afvalsoort of afvalsoorten) {
      await entityService.create('api::tarief.tarief', {
        data: {
          formaat,
          afval_soort: afvalsoort,
          prijs: Math.round(basisprijs[formaat] * afvalFactor[afvalsoort] * 100) / 100,
        },
      });
      tariefCount++;
    }
  }
  console.log(`✓ ${tariefCount} tarieven (${formaten.length} formaten × ${afvalsoorten.length} afvalsoorten)\n`);

  // ── 5. Opdrachten (10) ────────────────────────────────────────
  const opdrachtenDefs = [
    { type: 'plaatsing', status: 'geplaatst',   afval_soort: 'puin',  adres: 'Industrieweg 14',  postcode: '5688AB', plaatsnaam: 'Oirschot',            datum_gepland: '2026-06-01', datum_plaatsing: '2026-06-01', klantIdx: 0,  containerIdx: 0, chauffeurIdx: 0, betaling_type: 'factuur'  },
    { type: 'ophaling',  status: 'gepland',     afval_soort: 'afval', adres: 'Kastanjelaan 22',  postcode: '5651EF', plaatsnaam: 'Eindhoven',           datum_gepland: '2026-06-12', klantIdx: 2,  containerIdx: 3, chauffeurIdx: 1, betaling_type: 'contant'  },
    { type: 'plaatsing', status: 'onderweg',    afval_soort: 'hout',  adres: 'Kerkstraat 8',     postcode: '5462GH', plaatsnaam: 'Veghel',              datum_gepland: '2026-06-08', klantIdx: 3,  containerIdx: 2, chauffeurIdx: 2, betaling_type: 'factuur'  },
    { type: 'wisseling', status: 'gepland',     afval_soort: 'grond', adres: 'Dorpstraat 45A',   postcode: '5481IJ', plaatsnaam: 'Schijndel',           datum_gepland: '2026-06-14', klantIdx: 4,  containerIdx: 1, chauffeurIdx: 0, betaling_type: 'factuur'  },
    { type: 'ophaling',  status: 'opgehaald',   afval_soort: 'groen', adres: 'Groeneweg 7',      postcode: '5271KL', plaatsnaam: 'Sint-Michielsgestel', datum_gepland: '2026-05-22', datum_ophaling: '2026-05-22', klantIdx: 5, containerIdx: 3, chauffeurIdx: 1, betaling_type: 'factuur'  },
    { type: 'plaatsing', status: 'gepland',     afval_soort: 'puin',  adres: 'Nieuwstraat 33',   postcode: '5701OP', plaatsnaam: 'Helmond',             datum_gepland: '2026-06-17', klantIdx: 7,  containerIdx: 4, chauffeurIdx: 2, betaling_type: 'factuur'  },
    { type: 'plaatsing', status: 'geannuleerd', afval_soort: 'afval', adres: 'Boslaan 5',        postcode: '5631QR', plaatsnaam: 'Eindhoven',           datum_gepland: '2026-06-05', klantIdx: 8,  containerIdx: 1, chauffeurIdx: 0, betaling_type: 'contant'  },
    { type: 'ophaling',  status: 'gepland',     afval_soort: 'hout',  adres: 'Tuinstraat 1',     postcode: '5664ST', plaatsnaam: 'Geldrop',             datum_gepland: '2026-06-19', klantIdx: 9,  containerIdx: 0, chauffeurIdx: 1, betaling_type: 'factuur'  },
    { type: 'wisseling', status: 'gewisseld',   afval_soort: 'puin',  adres: 'Daklaan 6',        postcode: '5611WX', plaatsnaam: 'Eindhoven',           datum_gepland: '2026-05-29', datum_wisseling: '2026-05-29', klantIdx: 11, containerIdx: 3, chauffeurIdx: 2, betaling_type: 'factuur'  },
    { type: 'plaatsing', status: 'gepland',     afval_soort: 'grond', adres: 'Heuvellaan 18',    postcode: '5491YZ', plaatsnaam: 'Sint-Oedenrode',      datum_gepland: '2026-06-21', klantIdx: 12, containerIdx: 4, chauffeurIdx: 0, betaling_type: 'factuur', extra_huur_actief: true, extra_huur_dagen: 7 },
  ];

  const opdrachten = [];
  for (let i = 0; i < opdrachtenDefs.length; i++) {
    const def = opdrachtenDefs[i];
    const data = {
      opdracht_nummer:  2026001 + i,
      type:             def.type,
      status:           def.status,
      afval_soort:      def.afval_soort,
      adres:            def.adres,
      postcode:         def.postcode,
      plaatsnaam:       def.plaatsnaam,
      datum_gepland:    def.datum_gepland,
      betaling_type:    def.betaling_type,
      extra_huur_actief: def.extra_huur_actief || false,
      extra_huur_dagen:  def.extra_huur_dagen  || 0,
      klant:             klanten[def.klantIdx].id,
      container:         containers[def.containerIdx].id,
      chauffeur:         chauffeurs[def.chauffeurIdx].id,
    };
    if (def.datum_plaatsing) data.datum_plaatsing = def.datum_plaatsing;
    if (def.datum_ophaling)  data.datum_ophaling  = def.datum_ophaling;
    if (def.datum_wisseling) data.datum_wisseling = def.datum_wisseling;

    const o = await entityService.create('api::opdracht.opdracht', { data });
    opdrachten.push(o);
    console.log(`  + Opdracht #${data.opdracht_nummer} ${def.type} [${def.status}] → ${def.plaatsnaam}`);
  }
  console.log(`✓ ${opdrachten.length} opdrachten\n`);

  // ── 6. Facturen voor afgesloten opdrachten ────────────────────
  const facturenDefs = [
    { opdracht_nummer: 0, klantIdx: 0,  status: 'betaald',   subtotaal: 200.00, btw: 42.00,  factuurdatum: '2026-06-01', vervaldatum: '2026-06-15' },
    { opdracht_nummer: 4, klantIdx: 5,  status: 'verzonden',  subtotaal: 153.13, btw: 32.16,  factuurdatum: '2026-05-22', vervaldatum: '2026-06-05' },
    { opdracht_nummer: 8, klantIdx: 11, status: 'betaald',   subtotaal: 320.00, btw: 67.20,  factuurdatum: '2026-05-29', vervaldatum: '2026-06-12' },
  ];

  for (let i = 0; i < facturenDefs.length; i++) {
    const def = facturenDefs[i];
    await entityService.create('api::factuur.factuur', {
      data: {
        factuur_nummer:    `F-2026-${String(i + 1).padStart(3, '0')}`,
        status:            def.status,
        subtotaal:         def.subtotaal,
        btw_bedrag:        def.btw,
        totaal:            Math.round((def.subtotaal + def.btw) * 100) / 100,
        verwerking_bedrag: def.subtotaal,
        factuurdatum:      def.factuurdatum,
        vervaldatum:       def.vervaldatum,
        opdracht:          opdrachten[def.opdracht_nummer].id,
        klant:             klanten[def.klantIdx].id,
      },
    });
    console.log(`  + Factuur F-2026-${String(i + 1).padStart(3, '0')} [${def.status}]`);
  }
  console.log(`✓ ${facturenDefs.length} facturen\n`);

  await app.destroy();
  console.log('🌱 Seed klaar!');
  console.log('\nChauffeur logins (wachtwoord: Chauffeur1!):');
  for (const c of chauffeurDefs) {
    console.log(`  ${c.email}`);
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
