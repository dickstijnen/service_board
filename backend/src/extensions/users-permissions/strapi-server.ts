/**
 * Users-permissions uitbreiding: zet `laatst_ingelogd` bij elke geslaagde
 * frontend-login via POST /api/auth/local. Strapi houdt dit standaard niet bij.
 *
 * In Strapi 5 is de `auth`-controller een FACTORY (`({ strapi }) => ({ callback })`),
 * geen object. We wrappen dus de factory: eerst de originele controller opbouwen,
 * daarna z'n `callback` (de local-login handler) omwikkelen — origineel eerst,
 * en bij succes (ctx.body.user aanwezig) het tijdstip op de gebruiker stampen.
 * Bestaande gebruikers krijgen pas een waarde bij hun volgende login.
 */
export default (plugin: any) => {
  const origineleFactory = plugin.controllers.auth

  plugin.controllers.auth = (opts: any) => {
    const controller = origineleFactory(opts)
    const origineleCallback = controller.callback

    controller.callback = async (ctx: any) => {
      await origineleCallback(ctx)
      try {
        const user = ctx.body?.user
        if (user?.id) {
          await strapi.query('plugin::users-permissions.user').update({
            where: { id: user.id },
            data: { laatst_ingelogd: new Date() },
          })
        }
      } catch (e) {
        strapi.log.error('[users-permissions] laatst_ingelogd bijwerken mislukt', e)
      }
    }

    return controller
  }

  return plugin
}
