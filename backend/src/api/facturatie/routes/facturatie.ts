export default {
  routes: [
    {
      method: 'GET',
      path: '/facturatie/te-factureren',
      handler: 'facturatie.teFactureren',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/facturatie/preview/:opdracht_id',
      handler: 'facturatie.preview',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/facturatie/snelstart-export',
      handler: 'facturatie.snelstartExport',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/facturen/:id/pdf',
      handler: 'facturatie.pdf',
      config: { policies: [], middlewares: [] },
    },
  ],
}
