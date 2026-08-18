/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-domain-to-application-or-infrastructure',
      comment:
        'El dominio no debe depender de application ni de infrastructure (ADR-017 / Master Spec §ROP).',
      severity: 'error',
      from: {
        path: '^src/modules/[^/]+/domain',
        pathNot: '\\.spec\\.ts$',
      },
      to: { path: '^src/modules/[^/]+/(application|infrastructure)' },
    },
    {
      name: 'no-application-to-infrastructure',
      comment:
        'La capa de application no debe depender de infrastructure (ADR-017 / Master Spec §ROP).',
      severity: 'error',
      from: {
        path: '^src/modules/[^/]+/application',
        pathNot: '\\.spec\\.ts$',
      },
      to: { path: '^src/modules/[^/]+/infrastructure' },
    },
    {
      name: 'no-application-framework-imports',
      comment:
        'La capa de application no debe importar NestJS: la DI se resuelve en infrastructure/module mediante factories y tokens (MSF-ID-002).',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/application' },
      to: { path: '^@nestjs' },
    },
    {
      name: 'no-domain-framework-imports',
      comment:
        'El dominio no debe importar NestJS, Prisma, HTTP ni SDKs externos (Master Spec §ROP).',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/domain' },
      to: {
        path: '^(@nestjs|prisma|@prisma|express|axios|aws-sdk|@aws-sdk)',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No se permiten dependencias circulares entre módulos.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+',
      },
      archi: {
        collapsePattern: '^(node_modules|packages|src/modules|src/shared)/[^/]+',
      },
    },
  },
};
