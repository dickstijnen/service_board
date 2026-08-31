// import type { Core } from '@strapi/strapi';

// Content-types met een standaard core-router (find/findOne/create/update/delete).
const CRUD_CONTENT_TYPES = [
  'chauffeur-beschikbaarheid',
  'container',
  'factuur',
  'klant',
  'melding',
  'opdracht-foto',
  'opdracht',
  'tarief',
];

const CRUD_ACTIONS = ['find', 'findOne', 'create', 'update', 'delete'];

// Custom controller-acties (geen core-router) + plugin-acties.
const CUSTOM_ACTIONS = [
  'api::dashboard.dashboard.stats',
  'api::dashboard.dashboard.containersKaart',
  'api::dashboard.dashboard.chauffeurAanmaken',
  'api::dashboard.dashboard.chauffeurBijwerken',
  'api::facturatie.facturatie.teFactureren',
  'api::facturatie.facturatie.preview',
  'api::facturatie.facturatie.snelstartExport',
  'api::facturatie.facturatie.pdf',
  // Chauffeurs-pagina leest users-permissions users (rol=chauffeur).
  'plugin::users-permissions.user.find',
  'plugin::users-permissions.user.findOne',
  // Chauffeur-app uploadt foto's (POST /api/upload) en koppelt ze aan een opdracht-foto.
  'plugin::upload.content-api.upload',
];

function buildActionList(): string[] {
  const crud = CRUD_CONTENT_TYPES.flatMap((ct) =>
    CRUD_ACTIONS.map((action) => `api::${ct}.${ct}.${action}`)
  );
  return [...crud, ...CUSTOM_ACTIONS];
}

async function grantAuthenticatedPermissions(strapi: any) {
  const role = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'authenticated' } });

  if (!role) {
    strapi.log.warn('[bootstrap] authenticated rol niet gevonden — permissies overgeslagen');
    return;
  }

  const actions = buildActionList();
  let created = 0;

  for (const action of actions) {
    const existing = await strapi.db
      .query('plugin::users-permissions.permission')
      .findOne({ where: { action, role: role.id } });

    if (!existing) {
      await strapi.db
        .query('plugin::users-permissions.permission')
        .create({ data: { action, role: role.id } });
      created++;
    }
  }

  strapi.log.info(
    `[bootstrap] authenticated permissies: ${created} toegevoegd, ${actions.length - created} bestonden al`
  );
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    await grantAuthenticatedPermissions(strapi);
  },
};
