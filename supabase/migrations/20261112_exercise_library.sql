-- Biblioteca inicial de exercícios FitMind AI.
-- Execute uma única vez no Supabase SQL Editor.
alter table public.exercises
  add column if not exists difficulty text not null default 'Iniciante';

create index if not exists exercises_muscle_group_name_idx
  on public.exercises (muscle_group, name);

drop policy if exists "exercises readable by signed in users" on public.exercises;
create policy "exercises readable by signed in users"
  on public.exercises for select to authenticated using (true);

drop policy if exists "admins manage exercise catalog" on public.exercises;
create policy "admins manage exercise catalog"
  on public.exercises for all to authenticated
  using (exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  ))
  with check (exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  ));

insert into public.exercises (name, muscle_group, instructions, equipment, difficulty)
select v.name, v.muscle_group, v.instructions, v.equipment, v.difficulty
from (values
('Supino reto com barra','Peito','Deite no banco, mantenha os pés firmes e desça a barra controladamente até próximo ao peito. Empurre sem tirar os ombros do banco.','Barra e banco','Intermediário'),
('Supino inclinado com halteres','Peito','No banco inclinado, desça os halteres ao lado do peito e empurre para cima sem bater os pesos.','Halteres e banco inclinado','Intermediário'),
('Supino máquina','Peito','Ajuste o banco para as alças ficarem na linha do peito. Empurre e retorne devagar.','Máquina','Iniciante'),
('Crucifixo reto com halteres','Peito','Com leve flexão dos cotovelos, abra os braços até sentir alongamento confortável e feche acima do peito.','Halteres e banco','Intermediário'),
('Crossover na polia','Peito','Com tronco estável, traga as mãos à frente do corpo e retorne controlando a abertura.','Polias','Intermediário'),
('Flexão de braços','Peito','Mantenha corpo alinhado, mãos um pouco além dos ombros e aproxime o peito do chão antes de empurrar.','Peso corporal','Iniciante'),
('Puxada frontal aberta','Costas','Puxe a barra em direção à parte superior do peito, levando os cotovelos para baixo. Evite balançar o tronco.','Polia alta','Iniciante'),
('Puxada supinada','Costas','Segure a barra com as palmas voltadas para você e puxe até a parte superior do peito.','Polia alta','Iniciante'),
('Remada baixa sentada','Costas','Sente-se com coluna neutra, puxe a alça em direção ao abdômen e retorne sem arredondar as costas.','Cabo e triangulo','Iniciante'),
('Remada curvada com barra','Costas','Incline o tronco com coluna neutra, puxe a barra em direção ao abdômen e desça controlando.','Barra','Avançado'),
('Remada unilateral com halter','Costas','Apoie uma mão no banco, mantenha o tronco estável e puxe o halter em direção ao quadril.','Halter e banco','Intermediário'),
('Remada articulada máquina','Costas','Ajuste o apoio do peito e puxe as alças até aproximar as escápulas, retornando devagar.','Máquina','Iniciante'),
('Pullover na polia','Costas','Com braços quase estendidos, leve a barra de cima para baixo até a linha das coxas.','Polia alta','Intermediário'),
('Desenvolvimento com halteres','Ombros','Sente-se, mantenha abdômen firme e empurre os halteres acima da cabeça sem arquear a lombar.','Halteres e banco','Intermediário'),
('Desenvolvimento máquina','Ombros','Ajuste as alças na altura dos ombros e empurre para cima com controle.','Máquina','Iniciante'),
('Elevação lateral com halteres','Ombros','Eleve os braços lateralmente até aproximadamente a altura dos ombros, sem impulso.','Halteres','Iniciante'),
('Elevação lateral na polia','Ombros','Com a polia baixa, eleve o braço lateralmente mantendo o cotovelo levemente flexionado.','Polia baixa','Intermediário'),
('Elevação frontal com halteres','Ombros','Eleve os halteres à frente até a altura dos ombros e retorne lentamente.','Halteres','Iniciante'),
('Crucifixo inverso máquina','Ombros','Com peito apoiado, abra os braços para trás controlando o movimento.','Peck deck inverso','Iniciante'),
('Agachamento livre','Quadríceps e glúteos','Afaste os pés na largura confortável, desça mantendo os joelhos alinhados aos pés e tronco firme.','Barra','Avançado'),
('Leg press 45 graus','Quadríceps e glúteos','Posicione os pés na plataforma, desça sem tirar o quadril do encosto e empurre sem travar os joelhos.','Leg press','Iniciante'),
('Cadeira extensora','Quadríceps','Ajuste o eixo na linha do joelho, estenda as pernas e retorne lentamente.','Máquina','Iniciante'),
('Afundo com halteres','Quadríceps e glúteos','Dê um passo à frente, desça verticalmente mantendo equilíbrio e empurre o chão para retornar.','Halteres','Intermediário'),
('Agachamento goblet','Quadríceps e glúteos','Segure um halter junto ao peito e agache mantendo o tronco firme e os pés apoiados.','Halter','Iniciante'),
('Cadeira flexora','Posterior de coxa','Ajuste o rolo próximo ao tornozelo, flexione os joelhos e retorne controlando.','Máquina','Iniciante'),
('Mesa flexora','Posterior de coxa','Deite com joelhos alinhados ao eixo e flexione as pernas sem elevar o quadril.','Máquina','Iniciante'),
('Stiff com halteres','Posterior de coxa e glúteos','Leve o quadril para trás com joelhos semiflexionados e coluna neutra; suba contraindo glúteos.','Halteres','Intermediário'),
('Levantamento terra romeno','Posterior de coxa e glúteos','Desça a barra próxima às pernas levando o quadril para trás, mantendo coluna neutra.','Barra','Avançado'),
('Elevação pélvica','Glúteos','Apoie as costas no banco, eleve o quadril até alinhar tronco e coxas e desça controlando.','Banco e barra','Intermediário'),
('Abdução de quadril máquina','Glúteos','Abra os joelhos contra a resistência e retorne devagar, sem impulsos.','Máquina','Iniciante'),
('Panturrilha em pé','Panturrilhas','Eleve os calcanhares até a ponta dos pés e desça com amplitude confortável.','Máquina','Iniciante'),
('Panturrilha sentada','Panturrilhas','Com joelhos apoiados, eleve os calcanhares e retorne lentamente.','Máquina','Iniciante'),
('Rosca direta com barra','Bíceps','Mantenha cotovelos próximos ao tronco, flexione os braços e desça sem balançar o corpo.','Barra','Iniciante'),
('Rosca alternada com halteres','Bíceps','Flexione um cotovelo de cada vez, mantendo o punho alinhado e o tronco estável.','Halteres','Iniciante'),
('Rosca martelo','Bíceps','Segure os halteres com pegada neutra e flexione os cotovelos sem mover os ombros.','Halteres','Iniciante'),
('Rosca Scott','Bíceps','Apoie os braços no banco Scott e flexione os cotovelos sem estender bruscamente.','Banco Scott e barra','Intermediário'),
('Tríceps pulley barra','Tríceps','Mantenha cotovelos junto ao corpo, estenda os braços e retorne sem abrir os cotovelos.','Polia alta','Iniciante'),
('Tríceps corda','Tríceps','Empurre a corda para baixo e afaste levemente as pontas no final do movimento.','Polia alta','Iniciante'),
('Tríceps francês com halter','Tríceps','Com braços acima da cabeça, flexione os cotovelos levando o halter atrás da cabeça e estenda.','Halter','Intermediário'),
('Mergulho assistido','Tríceps e peito','Use a máquina assistida, desça flexionando os cotovelos e empurre para retornar sem dor.','Máquina assistida','Intermediário'),
('Prancha abdominal','Abdômen','Apoie antebraços e pontas dos pés, mantenha o corpo alinhado e contraia o abdômen.','Peso corporal','Iniciante'),
('Abdominal crunch','Abdômen','Deitado com joelhos flexionados, eleve levemente os ombros contraindo o abdômen sem puxar o pescoço.','Peso corporal','Iniciante'),
('Elevação de joelhos','Abdômen','Suspenso ou apoiado, eleve os joelhos em direção ao tronco e retorne com controle.','Barra ou cadeira romana','Intermediário'),
('Abdominal na polia','Abdômen','Ajoelhe-se diante da polia e flexione o tronco aproximando as costelas da pelve.','Polia alta','Intermediário'),
('Prancha lateral','Abdômen','Apoie um antebraço e a lateral dos pés, mantendo quadril elevado e corpo alinhado.','Peso corporal','Iniciante'),
('Caminhada na esteira','Cardio','Caminhe em ritmo confortável, aumente a velocidade gradualmente e mantenha postura natural.','Esteira','Iniciante'),
('Corrida na esteira','Cardio','Comece com aquecimento e aumente o ritmo progressivamente conforme seu condicionamento.','Esteira','Intermediário'),
('Bicicleta ergométrica','Cardio','Ajuste banco e guidão, mantenha cadência confortável e aumente a resistência gradualmente.','Bicicleta','Iniciante'),
('Transport elíptico','Cardio','Mantenha postura ereta e movimente braços e pernas de forma coordenada.','Elíptico','Iniciante'),
('Burpee adaptado','Cardio e corpo inteiro','Agache, apoie as mãos no chão, leve os pés para trás e retorne sem salto se necessário.','Peso corporal','Intermediário')
) as v(name,muscle_group,instructions,equipment,difficulty)
where not exists (
  select 1 from public.exercises e where lower(e.name)=lower(v.name)
);
