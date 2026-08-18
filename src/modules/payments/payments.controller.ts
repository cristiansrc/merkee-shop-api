import { Controller } from '@nestjs/common';

/**
 * Adapter de entrada HTTP del módulo `payments`.
 *
 * Esqueleto vacío: no declara rutas funcionales (fuera de alcance de
 * MSF-API-001). Cuando se implemente, los webhooks validarán firma sobre raw
 * body antes de crear el Command; nunca contendrán reglas de negocio ni
 * Prisma.
 */
@Controller()
export class PaymentsController {}
