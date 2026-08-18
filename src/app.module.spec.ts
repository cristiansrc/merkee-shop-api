import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule (arranque mínimo)', () => {
  it('compila el grafo de módulos del monolito', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(moduleRef).toBeDefined();
  });
});
