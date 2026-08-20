import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';
import { corsOptions } from './shared/http/cors.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // RCA-FIX: Prefijo global v1 alineado con OpenAPI y ALB (§MSF-API-002).
  // Excluye GET /health porque el target group del ALB verifica esa ruta
  // en la raíz sin prefijo.
  app.setGlobalPrefix('v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  app.enableCors(corsOptions);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
