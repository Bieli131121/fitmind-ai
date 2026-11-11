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
4. Preencha `.env.local` com a URL e a Publishable Key do seu projeto Supabase. O ZIP contém apenas valores de exemplo, sem credenciais reais.
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


## Executar e testar a conexão com o Supabase

1. Abra esta pasta no VS Code.
2. Crie `.env.local` a partir de `.env.example` e preencha suas credenciais Supabase. Não compartilhe esse arquivo publicamente.
3. No terminal, execute `npm install` e depois `npm run dev`.
4. Acesse `http://localhost:3000/cadastro`, crie uma conta com um e-mail seu e uma senha com pelo menos 8 caracteres.
5. Se a confirmação por e-mail estiver ativa no Supabase, abra a mensagem recebida, confirme a conta e depois entre em `http://localhost:3000/login`.
6. Após entrar, o painel deverá abrir. A página inicial agora exige sessão autenticada.
7. No Supabase, abra Authentication → Users e confira se o usuário aparece. Em Table Editor, confira se foi criado um registro em `profiles` e outro em `subscriptions`.

Se o e-mail de confirmação não chegar, confira Spam e as configurações de Authentication → URL Configuration / Email. Para testes locais, adicione `http://localhost:3000/**` à lista de Redirect URLs.

Observação: cadastro/login e salvamento do perfil estão conectados ao Supabase. O registro de treinos e o histórico de evolução ainda são partes demonstrativas do MVP e serão ligados ao banco na próxima etapa.

## Administração e financeiro (nova etapa)

1. Configure `.env.local` com as variáveis de `.env.example` (não compartilhe esse arquivo).
2. No Supabase SQL Editor, execute primeiro `supabase/schema.sql` somente se estiver criando um banco novo. Para o banco que já está em uso, execute apenas `supabase/migrations/20261111_admin_finance.sql`.
3. Crie a conta do proprietário pelo cadastro normal do app. Depois, no SQL Editor confiável, substitua o e-mail no comando comentado ao final da migration para atribuir a função `admin` à conta correta. Não existe opção pública para um usuário se tornar administrador.
4. Acesse `/admin` com essa conta. Usuários comuns são redirecionados para o início.
5. Acesse `/financeiro` para consultar o plano e o histórico de cobranças.

A migration preserva a tabela `subscriptions` existente e cria estrutura inicial de planos, pagamentos, métodos de pagamento (somente referências/token do provedor), faturas, eventos e auditoria. Os preços Premium permanecem não configurados até serem definidos. O checkout, webhooks assinados, reembolso e gestão de preços ainda exigem implementação server-side antes de receber pagamentos reais. Nunca coloque chaves secretas do provedor ou a chave `service_role` no navegador ou neste ZIP.

## Treinos personalizados, calendário e nutrição com IA

Esta versão adiciona:
- Cadastro, edição e exclusão de planos de treino próprios, com exercícios, séries, repetições e dia da semana.
- Calendário pessoal para programar atividades e associar um plano de treino.
- Área de nutrição que solicita uma sugestão alimentar à IA e salva a última resposta na conta.
- API server-side para IA: a chave OpenAI nunca é enviada ao navegador.

### Ativação no Supabase

No SQL Editor do projeto já utilizado, execute **uma única vez**:
`supabase/migrations/20261111_workouts_calendar_diet.sql`

Não execute novamente o schema inicial nem a migration de administração/financeiro se eles já foram aplicados.

### Ativação da IA alimentar

Adicione `OPENAI_API_KEY` nas variáveis de ambiente do `.env.local` para testes locais e nas Environment Variables da Vercel para produção. Opcionalmente, defina `OPENAI_MODEL` (padrão `gpt-4o-mini`). Depois reinicie o servidor local ou faça redeploy na Vercel. A chave deve ser secreta e nunca deve começar com `NEXT_PUBLIC_`.

Sem a chave, treinos e calendário continuam funcionando; a tela de nutrição informará que a IA ainda não foi configurada. A geração usa a API da OpenAI e pode gerar custos conforme o uso e o modelo escolhido.

### Limites da sugestão alimentar

O conteúdo gerado é educativo, não é prescrição nutricional nem substitui nutricionista. Não deve ser usado para tratar condições médicas ou validar alergias/intolerâncias. Menores de 18 anos e pessoas com necessidades clínicas devem buscar orientação profissional.
