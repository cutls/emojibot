import dotenv from 'dotenv'
import axios from 'axios'
import megalodon from '@cutls/megalodon'
import MisskeyEntity from '@cutls/megalodon/lib/src/misskey/entity'
import Jimp from 'jimp'
import fs from 'fs'
import path from 'path'
import { IConfig } from '../types'
dotenv.config()
const config = process.env as unknown as IConfig
const client = megalodon('misskey', `https://${config.DOMAIN}`, config.I)

export default async function mentionHandler(note: MisskeyEntity.Note | any) {
    try {
        const postId = note.id
        const { text } = note
        if (!text) return console.log('noText')
        const name = text.replace(/@\S+/g, '').replace(/\s|​/g, '').replace(/:/g, '')
        const userAxios = await axios.post(`https://${config.DOMAIN}/api/users/show`, { i: config.I, userId: note.userId })
        const user = userAxios.data as MisskeyEntity.UserDetail
        const userExtended: any = user // for role, not implemented by megalodon
        if (user.host) return console.log('notLocal') // Forbidden: only local user
        if (!userExtended.roles.map((r: any) => r.id).includes(config.ROLE_ID)) return console.log('notRoled') // Forbidden: only 'roled' user
        if (name.match(/^\/delete/)) {
            if (!userExtended.roles.map((r: any) => r.id).includes(config.ADMIN_ROLE_ID)) return console.log('notAdmin') // Forbidden: only 'roled' user
            const replyEntity = note.reply
            if (!replyEntity) return reply('返信がありません', postId)
            const m = replyEntity.text.match(/:[a-zA-Z0-9_]+:/)
            if (!m || !m.length) return reply('適切な返信がありません', postId)
            const name = m[0].replace(/:/g, '')
            const listAxios = await axios.post(`https://${config.DOMAIN}/api/admin/emoji/list`, { i: config.I, query: name })
            const list = listAxios.data
            if (!list.length) return reply('絵文字が見つかりません', postId)
            const emojiId = list[0].id
            await axios.post(`https://${config.DOMAIN}/api/admin/emoji/delete`, { i: config.I, id: emojiId })
            return reply('削除されました', postId)
        }
        const { files } = note
        if (!files || !files.length || files.length >= 2) return console.log('notFile')
        const [file] = files
        const { type, url, name: fileName } = file
        if (!type.match(/^image\//)) return console.log('notImage')
        let bin: Buffer
        if (type === 'image/apng' || type === 'image/gif') {
            const binAxios = await axios.get(url, { responseType: 'arraybuffer' })
            bin = Buffer.from(binAxios.data)
        } else {
            const binJimp = await Jimp.read(url)
            const forceSquare = isTrue(config.FORCE_SQUARE)
            const width = binJimp.getWidth()
            const height = binJimp.getHeight()
            if (forceSquare && Math.max(width, height) > Math.min(width, height) * 1.1) return reply('カスタム絵文字は正方形である必要があります。', postId)
            const isHorizontal = width === Math.max(width, height) // 横長
            const small = binJimp.resize(isHorizontal ? 128 : Jimp.AUTO, !isHorizontal ? 128 : Jimp.AUTO)
            bin = await small.getBufferAsync(Jimp.MIME_PNG)
        }
        const path = `tmp/${fileName}`
        fs.writeFileSync(path, bin)
        const stat = fs.statSync(path)
        fs.unlinkSync(path)
        if (stat.size > parseInt(config.MAX_KB, 10) * 1024) return reply(`ファイルが大きすぎます(最大${config.MAX_KB}KB)`, postId)
        const media = await client.uploadMedia(bin)
        const fileId = media.data.id
        const addAxios = await axios.post(`https://${config.DOMAIN}/api/admin/emoji/add`, { i: config.I, fileId })
        const emojiId = addAxios.data.id
        await axios.post(`https://${config.DOMAIN}/api/admin/emoji/update`, { i: config.I, name, id: emojiId, category: 'ユーザー追加', aliases: [''] })
        await reply(`新しい絵文字が追加されました！ :${name}:  #${config.HASHTAG}`)
    } catch (e: any) {
        console.error(e.response.data)
    }
}
async function reply(text: string, postId?: string) {
    await axios.post(`https://${config.DOMAIN}/api/notes/create`, { i: config.I, replyId: postId, text })
}
function isTrue(text: string) {
    text = text.toLowerCase()
    return text === 'true' || text === 'yes' || text === '1'
}