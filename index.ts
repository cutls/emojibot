import Koa from 'koa'
import Router from 'koa-router'
import bodyParser from 'koa-bodyparser'
import dotenv from 'dotenv'
import MisskeyEntity from '@cutls/megalodon/lib/src/misskey/entity'
import mentionHandler from './handler/mention'
import { IConfig } from './types'
dotenv.config()
const config = process.env as unknown as IConfig

const router = new Router()
const koa = new Koa()
koa.use(bodyParser())
router.post('/webhook', async (ctx, next) => {
	if (ctx.request.header['x-misskey-hook-secret'] !== config.SECRET) return ctx.throw(401)
	const { body: koaBodyAny } = ctx.request
	const koaBody: any = koaBodyAny
	console.log('incoming')
	if (koaBody.type === 'mention') {
		const note = koaBody.body.note as MisskeyEntity.Note
		mentionHandler(note)
		return { success: true }
	} else {
		console.log('other type', koaBody)
	}
	return { success: false }
})
koa.use(router.routes())
koa.use(router.allowedMethods())

koa.listen(4000, () => {
	console.log('Server started!!')
})