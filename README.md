# FitMind AI — MVP inicial

Aplicativo fitness web com identidade premium escura, roxo e tipografia Manrope.

## O que já está incluído
- Dashboard responsivo com navegação entre Início, Treinos e Evolução.
- Tela de treino com marcação de séries e progresso.
- Cadastro e login Supabase (dependem da configuração das credenciais).
- Formulário de perfil com salvamento no Supabase.
- Schema PostgreSQL inicial com RLS, perfil automático e tabelas de treinos, sessões, séries, métricas e assinatura.
- Estrutura preparada para integração futura de IA e Mercado Pago.

## Requisitos
- Node.js 20.9 ou superior
- Projeto Supabase

## Instalação
1. Descompacte o projeto.
2. Execute `npm install`.
3. Copie `.env.example` para `.env.local`.
4. O arquivo `.env.local` já está preparado com a URL e a Publishable Key informadas. Se estiver configurando em outro computador, copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. No SQL Editor do Supabase, execute `supabase/schema.sql`.
6. Execute `npm run dev` e abra `http://localhost:3000`.

## Importante
Sem as credenciais do Supabase, o dashboard abre em modo demonstração e cadastro/login/salvamento persistente não funcionam. Não use chaves secretas no navegador. `OPENAI_API_KEY` e `MERCADOPAGO_ACCESS_TOKEN` devem ser usadas somente em rotas de servidor, quando esses módulos forem implementados.

## Próximas entregas
1. Persistir planos, sessões e séries no Supabase.
2. Implementar onboarding completo.
3. Criar API server-side para geração de treino com IA e validação de saída.
4. Implementar histórico e gráficos reais.
5. Implementar assinatura e webhooks Mercado Pago.
6. Testes automatizados e deploy.

## Segurança
O schema ativa RLS para dados de usuários. Revise as políticas e execute testes com duas contas distintas antes de produção. A política de leitura de exercícios é pública para usuários autenticados; a manutenção do catálogo deve ser feita por administrador/service role, nunca expondo a service role no cliente.
