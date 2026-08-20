import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOptions } from './shared/http/cors.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.enableCors(corsOptions);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
