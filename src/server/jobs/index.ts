import { jobAvisos } from '@/server/jobs/avisos'
import { jobInvitacionesVotar } from '@/server/jobs/invitaciones'
import { jobLimpieza } from '@/server/jobs/limpieza'
import { jobPoliticaSuspensionReclamos } from '@/server/jobs/suspension-reclamos'
import { jobSLA } from '@/server/jobs/sla'
import { jobAvisosAumento, jobAplicarAumentos } from '@/services/ajustes-precio'
import { registrarJob } from '@/server/jobs/registry'
import { jobVencidas } from '@/server/jobs/vencidas'

/**
 * Punto de entrada del cron diario.
 *
 * Los jobs se registran acá una sola vez. Un módulo futuro agrega su job en
 * este archivo y no toca el endpoint ni el orquestador.
 *
 * El orden importa: los avisos se calculan sobre suscripciones `ACTIVE`, así
 * que tienen que correr antes de que `vencidas` las pase a `EXPIRED`. Si se
 * invirtiera, el último aviso de un período vencido nunca saldría.
 */
registrarJob(jobAvisos)
registrarJob(jobVencidas)
registrarJob(jobLimpieza)
registrarJob(jobInvitacionesVotar)
registrarJob(jobPoliticaSuspensionReclamos)
registrarJob(jobSLA)
registrarJob(jobAvisosAumento)
registrarJob(jobAplicarAumentos)

export { ejecutarTodos as ejecutarCron } from '@/server/jobs/registry'
