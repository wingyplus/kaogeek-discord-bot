import * as path from 'path'
import Client, { connect } from "@dagger.io/dagger"

async function pipeline(client: Client) {
	const host = client
		.host()
		.directory(
			path.normalize(path.join(path.resolve(), "..")),
			{ exclude: ["node_modules"] }
		)

	const node = client.container().from('node:18-alpine')

	const nodePackage = node
		.withWorkdir("/app")
		.withDirectory(".", host, { include: ["package.json", "pnpm-lock.yaml*"] })

	const user = "node"
	const owner = `${user}:${user}`

	const builder = nodePackage
		.withExec(["npx", "pnpm", "-r", "i", "--frozen-lockfile"])
		.withDirectory("/app", host, { include: ["src", "tsconfig.json", "prisma"] })
		.withExec(["npx", "prisma", "generate"])
		.withExec(["npx", "pnpm", "build"])

	const depsProd = nodePackage
		.withExec(["npx", "pnpm", "-r", "i", "--frozen-lockfile", "--prod"])
		.withDirectory("prisma", host.directory("prisma"))
		.withExec(["npx", "prisma", "generate"])

	const runner = node
		.withLabel("name", "kaogeek-discord-bot")
		.withLabel("org.opencontainers.image.ref.name", "kaogeek-discord-bot")
		.withEnvVariable("NODE_ENV", "production")
		.withUser(user)
		.withWorkdir("/app")
		.withFile("package.json", host.file("package.json"), { owner: owner })
		.withDirectory("node_modules", depsProd.directory("node_modules"), { owner: owner })
		.withDirectory("prisma", depsProd.directory("prisma"), { owner: owner })
		.withDirectory("dist", builder.directory("dist"), { owner: owner })
		.withDefaultArgs({ args: ["/app/dist/client.js"] })

	await runner.export("kaogeek.tar")
}

connect(pipeline, { LogOutput: process.stderr }) 
