-- Shorten lengthy post-assessment wording (English + Filipino) for mobile readability.
-- Text-only: no question/option ids, keys, display order, is_correct, or is_active values change,
-- so answer validation, scoring, and attempt history are unaffected.
-- Each update is pinned to its id (and, for options, its question_id and current is_correct);
-- the row-count assertions abort the migration if anything does not match.

do $$
declare
  updated_count integer;
begin
  create temporary table _concise_prompts (
    id uuid primary key,
    prompt text not null,
    prompt_tl text not null
  ) on commit drop;

  insert into _concise_prompts (id, prompt, prompt_tl) values
    -- Module 1
    ('dba67508-eff5-4197-b904-29a68d83f6c1',
     'The label on the nearest extinguisher is missing. What is the biggest risk of using it on a small fire?',
     'Nawawala ang label ng pinakamalapit na extinguisher. Ano ang pinakamalaking panganib kung gagamitin ito sa maliit na sunog?'),
    ('b6bdb14a-b893-4b7b-a2ba-b2cd4cfba174',
     'You are using an extinguisher on a small fire, but the flames grow within seconds. What should you do?',
     'Gumagamit ka ng extinguisher sa maliit na sunog, pero lumalaki ang apoy sa loob ng ilang segundo. Ano ang dapat mong gawin?'),
    ('5d69fada-8a4c-40b0-84e9-86aae8aaa318',
     'What happens if you aim the extinguisher at the top of the flames instead of the base?',
     'Ano ang mangyayari kung itututok mo ang extinguisher sa itaas ng apoy sa halip na sa base nito?'),
    ('b9512b1a-4faf-4f1e-a120-f8e6e88bb074',
     'A switched-on laptop starts smoking and catches fire. Which extinguisher should you use?',
     'Umuusok at nagliliyab ang isang nakabukas na laptop. Anong extinguisher ang dapat mong gamitin?'),
    ('c0a66b8c-274f-481d-9031-20cd3ce5b284',
     'Oil in a frying pan catches fire, and you have the right extinguisher. What is your first PASS step?',
     'Nagliyab ang mantika sa kawali at hawak mo na ang tamang extinguisher. Ano ang una mong hakbang sa PASS?'),
    ('13ee37cd-583b-45ff-9212-d0719391e51b',
     'In the PASS method, why do you sweep the nozzle from side to side?',
     'Sa PASS, bakit iwinawasiwas ang nozzle pakaliwa at pakanan?'),
    ('99064f4e-c274-4efc-9108-78439c2a9703',
     'A pile of rags soaked in engine oil catches fire. What class of fire is this?',
     'Nagliyab ang isang tumpok ng basahang babad sa langis ng makina. Anong klase ng sunog ito?'),
    ('182f8c52-ee6f-4103-a4c6-90dffc86b181',
     'In the PASS method, what happens when you keep squeezing the handle?',
     'Sa PASS, ano ang nangyayari kapag patuloy mong pinipiga ang hawakan?'),
    ('d4e6806b-2b8d-449c-8299-ecf8a2b2bf62',
     'Why are Class D fires, such as burning magnesium, especially dangerous?',
     'Bakit lalong mapanganib ang Class D na sunog, gaya ng nasusunog na magnesium?'),
    ('da26e59e-0db6-480d-9e5e-03d9c93d8df6',
     'If the fire does not weaken after 5–7 seconds of using an extinguisher, what should you do?',
     'Kung hindi humihina ang apoy matapos ang 5–7 segundong paggamit ng extinguisher, ano ang dapat mong gawin?'),
    -- Module 2
    ('f6589d5b-862b-48ba-b3c8-83a4e0a62128',
     'You reach a closed door while escaping a house fire. What is the safest thing to do before opening it?',
     'Nakarating ka sa nakasarang pinto habang tumatakas sa sunog. Ano ang pinakaligtas na gawin bago ito buksan?'),
    ('0e13381b-8126-4ae7-85b7-938e6689bf0f',
     'What should you do first if you hear a smoke alarm or see smoke at home?',
     'Ano ang una mong dapat gawin kapag nakarinig ka ng smoke alarm o nakakita ng usok sa bahay?'),
    -- Module 3
    ('4a0818c8-c2ec-4272-b965-e20e7c473be9',
     'What mainly causes an electrical fire?',
     'Ano ang pangunahing sanhi ng sunog na dulot ng kuryente?'),
    ('ee0c23f7-b4bd-4b70-90ea-2b5e5d0931c9',
     'If it is safe, what should you do first when you discover an electrical fire?',
     'Kung ligtas, ano ang una mong dapat gawin kapag may sunog na dulot ng kuryente?'),
    ('f4db0eb2-ba37-49b0-8c25-e8a612ab3bf6',
     'If you cannot safely cut the power during an electrical fire, what should you do?',
     'Kung hindi mo ligtas na mapatay ang kuryente habang may sunog na dulot ng kuryente, ano ang dapat mong gawin?'),
    -- Module 4
    ('3eaa45d3-149d-4f3d-8114-0a138f1b12b2',
     'Which statement about kitchen fires is true?',
     'Alin ang totoo tungkol sa sunog sa kusina?'),
    ('c96bf62a-90f1-4e68-a644-c6cd9d54832d',
     'Which of these is a common danger in kitchen fires?',
     'Alin dito ang karaniwang panganib sa sunog sa kusina?'),
    ('b9e4567e-f912-45cb-b854-0ae99e0423a3',
     'What is a main reason kitchen fires happen?',
     'Ano ang pangunahing dahilan ng sunog sa kusina?'),
    ('aec00834-1172-4ca7-93b6-fb4ef3b410f4',
     'Which kitchen fire starts when spilled food or grease buildup burns inside a baking appliance?',
     'Anong sunog sa kusina ang nagsisimula kapag nasunog ang natapong pagkain o naipong mantika sa loob ng panghurnong kagamitan?'),
    ('05a08133-eb23-429d-86d9-f68418d7550b',
     'Which habit often leads to kitchen fires?',
     'Aling gawi ang madalas magdulot ng sunog sa kusina?'),
    ('6b92c3e9-eaee-4210-89e4-ca165aa10039',
     'What is a simple way to prevent cooking-oil fires?',
     'Ano ang simpleng paraan para maiwasan ang sunog mula sa mantika?'),
    ('1a08544d-3ad3-4a30-bc87-af05bb040075',
     'If it is safe, what is your first step during a small pan fire?',
     'Kung ligtas, ano ang una mong hakbang sa maliit na sunog sa kawali?'),
    ('d8409543-68cd-451f-a6ec-e26ff00a3b82',
     'During any kitchen emergency, what is the most important safety reminder?',
     'Sa anumang emergency sa kusina, ano ang pinakamahalagang paalala sa kaligtasan?');

  update public.assessment_questions q
     set prompt = c.prompt,
         prompt_tl = c.prompt_tl
    from _concise_prompts c
   where q.id = c.id;
  get diagnostics updated_count = row_count;
  if updated_count <> 23 then
    raise exception 'Expected 23 question prompts updated, got %', updated_count;
  end if;

  create temporary table _concise_options (
    id uuid primary key,
    question_id uuid not null,
    is_correct boolean not null,
    option_text text not null,
    option_text_tl text not null
  ) on commit drop;

  insert into _concise_options (id, question_id, is_correct, option_text, option_text_tl) values
    -- M1 Q1: missing label
    ('be217469-df17-4f0a-9e88-1c59daa06717', 'dba67508-eff5-4197-b904-29a68d83f6c1', false,
     'The extinguisher may run out of agent too quickly.', 'Baka mabilis maubos ang laman ng extinguisher.'),
    ('539e30a6-785f-469e-9d2c-82858dc3084e', 'dba67508-eff5-4197-b904-29a68d83f6c1', false,
     'You might accidentally damage the extinguisher.', 'Baka aksidente mong masira ang extinguisher.'),
    ('8a1f79cc-e5f6-4571-8e4c-15c2907119cb', 'dba67508-eff5-4197-b904-29a68d83f6c1', true,
     'The wrong agent could make the fire worse or create hazards.', 'Ang maling pamatay-sunog ay puwedeng magpalala ng apoy o magdulot ng panganib.'),
    ('8aeb3c3f-ee0f-4e64-9adb-16f890498ad0', 'dba67508-eff5-4197-b904-29a68d83f6c1', false,
     'Using it would break a minor safety rule.', 'Lalabag ito sa isang maliit na patakaran sa kaligtasan.'),
    -- M1 Q2: flames grow within seconds
    ('5ffa4b95-d987-41d7-ab4b-29717f983ae2', 'b6bdb14a-b893-4b7b-a2ba-b2cd4cfba174', false,
     'Squeeze harder and sweep faster.', 'Pigain nang mas malakas at iwasiwas nang mas mabilis.'),
    ('9c2f074d-9107-4c60-b4dc-2d6d90cf7a31', 'b6bdb14a-b893-4b7b-a2ba-b2cd4cfba174', false,
     'Look for a bigger extinguisher.', 'Maghanap ng mas malaking extinguisher.'),
    ('a3bae78f-6d86-4e10-ac98-3c0a27fd03b4', 'b6bdb14a-b893-4b7b-a2ba-b2cd4cfba174', true,
     'Stop and evacuate immediately.', 'Huminto at lumikas kaagad.'),
    ('e65e22a5-c5c9-4d58-9fff-8298379bf6d9', 'b6bdb14a-b893-4b7b-a2ba-b2cd4cfba174', false,
     'Call for help and wait for firefighters.', 'Tumawag ng tulong at hintayin ang mga bumbero.'),
    -- M1 Q3: aiming at the top of the flames
    ('6cc7951c-84cd-48f6-9bba-19fae4c5373e', '5d69fada-8a4c-40b0-84e9-86aae8aaa318', false,
     'The fire goes out faster because of direct contact.', 'Mas mabilis mamamatay ang apoy dahil direktang tinatamaan.'),
    ('c5a7f797-1af8-4089-b9d0-e2745cf7cacc', '5d69fada-8a4c-40b0-84e9-86aae8aaa318', false,
     'The extinguisher sprays the agent at higher pressure.', 'Mas lalakas ang presyon ng spray ng extinguisher.'),
    ('a63f0a85-e585-4bc6-9bcf-a5f3d6a786a7', '5d69fada-8a4c-40b0-84e9-86aae8aaa318', true,
     'The agent misses the fuel, so the fire keeps burning.', 'Hindi maaabot ang panggatong, kaya patuloy ang apoy.'),
    ('ee9022e9-97cd-4037-af84-9f3c275c8a29', '5d69fada-8a4c-40b0-84e9-86aae8aaa318', false,
     'It makes the fire spread more quickly.', 'Mas bibilis ang pagkalat ng apoy.'),
    -- M1 Q4: laptop fire
    ('84b1a4c7-b92c-4cdd-9129-014667658c4c', 'b9512b1a-4faf-4f1e-a120-f8e6e88bb074', false,
     'Class B extinguisher', 'Extinguisher na pang-Class B'),
    ('ebb46c57-6e20-45e3-82da-c5a5ebc97900', 'b9512b1a-4faf-4f1e-a120-f8e6e88bb074', false,
     'Class A extinguisher', 'Extinguisher na pang-Class A'),
    ('f159e5f9-2b27-4490-b45e-7fcccbea3be8', 'b9512b1a-4faf-4f1e-a120-f8e6e88bb074', false,
     'Class K extinguisher', 'Extinguisher na pang-Class K'),
    ('3cca19ee-1d07-4197-a190-707a9c9527ea', 'b9512b1a-4faf-4f1e-a120-f8e6e88bb074', true,
     'Class C extinguisher', 'Extinguisher na pang-Class C'),
    -- M1 Q5: first PASS step
    ('38455fb3-0489-4d43-9092-aee63510d526', 'c0a66b8c-274f-481d-9031-20cd3ce5b284', false,
     'Aim at the base of the fire.', 'Itutok sa base ng apoy.'),
    ('007fbf80-9137-418a-8a02-ba5f775595b7', 'c0a66b8c-274f-481d-9031-20cd3ce5b284', false,
     'Squeeze the handle.', 'Pigain ang hawakan.'),
    ('a5b3ab48-3138-4d31-a858-47cf71bb30c9', 'c0a66b8c-274f-481d-9031-20cd3ce5b284', true,
     'Pull the safety pin.', 'Hilahin ang safety pin.'),
    ('78f768a4-a9fd-4ee6-9045-9b938798b16b', 'c0a66b8c-274f-481d-9031-20cd3ce5b284', false,
     'Sweep from side to side.', 'Iwasiwas pakaliwa at pakanan.'),
    -- M1 Q6: purpose of sweeping
    ('3d15b547-e88b-47b8-9bb1-dab6e2ed1388', '13ee37cd-583b-45ff-9212-d0719391e51b', false,
     'To spread the agent so it does not pile up in one spot.', 'Para kumalat ang pamatay-sunog at hindi maipon sa isang lugar.'),
    ('41308e81-161a-4ec8-9320-5550402567ad', '13ee37cd-583b-45ff-9212-d0719391e51b', true,
     'To cover the whole base of the burning material.', 'Para matakpan ang buong base ng nasusunog na bagay.'),
    ('a06b9f17-b357-4e0f-8aa6-36f65030a85b', '13ee37cd-583b-45ff-9212-d0719391e51b', false,
     'To cool down the surrounding air.', 'Para palamigin ang hangin sa paligid.'),
    ('057c22f9-1c91-4ae6-a462-e8b0b53ce430', '13ee37cd-583b-45ff-9212-d0719391e51b', false,
     'To signal that the fire is under control.', 'Para ipaalam na kontrolado na ang apoy.'),
    -- M1 Q7: oil-soaked rags
    ('f5dc4c5f-7ca9-4a30-815c-bf424869b3b9', '99064f4e-c274-4efc-9108-78439c2a9703', false,
     'Class A (ordinary combustibles)', 'Class A (karaniwang nasusunog na bagay)'),
    ('76520925-76d4-49f2-ab23-bff48aa754f9', '99064f4e-c274-4efc-9108-78439c2a9703', true,
     'Class B (flammable liquids)', 'Class B (nasusunog na likido)'),
    ('6109c1b0-ff16-44b8-9237-3b89668693ee', '99064f4e-c274-4efc-9108-78439c2a9703', false,
     'Class C (live electrical equipment)', 'Class C (kagamitang may kuryente)'),
    ('4613f20e-7b53-4730-9b1e-e6ed7244138b', '99064f4e-c274-4efc-9108-78439c2a9703', false,
     'Class K (cooking oils and fats)', 'Class K (mantika at taba sa pagluluto)'),
    -- M1 Q8: squeezing the handle
    ('8f56a026-12fe-4445-a93d-45f49af0766e', '182f8c52-ee6f-4103-a4c6-90dffc86b181', false,
     'It turns on an internal safety lock.', 'Pinapagana nito ang panloob na safety lock.'),
    ('f306209e-d65c-4230-8572-66287337f006', '182f8c52-ee6f-4103-a4c6-90dffc86b181', false,
     'It adjusts the spray pattern.', 'Inaayos nito ang hugis ng spray.'),
    ('37333206-c571-4092-b9ca-0f718b449758', '182f8c52-ee6f-4103-a4c6-90dffc86b181', true,
     'It releases the agent in a steady stream.', 'Tuloy-tuloy nitong inilalabas ang pamatay-sunog.'),
    ('7fbf31da-f980-43f1-aeb3-5be0d69eda66', '182f8c52-ee6f-4103-a4c6-90dffc86b181', false,
     'It recharges the extinguisher for later.', 'Nire-recharge nito ang extinguisher para sa susunod.'),
    -- M1 Q9: Class D fires
    ('3e12880d-cf4c-4cbf-8312-b20a74aadd9d', 'd4e6806b-2b8d-449c-8299-ecf8a2b2bf62', false,
     'They give off toxic fumes that kill quickly.', 'Naglalabas sila ng nakalalasong usok na mabilis makamatay.'),
    ('60d7b433-abe1-41fa-aded-d9be53099f7a', 'd4e6806b-2b8d-449c-8299-ecf8a2b2bf62', true,
     'The burning metal can react violently with common agents.', 'Ang nasusunog na metal ay puwedeng marahas na mag-react sa karaniwang pamatay-sunog.'),
    ('4e324270-d525-4007-89ec-e079e0a532e7', 'd4e6806b-2b8d-449c-8299-ecf8a2b2bf62', false,
     'They are always large and spread quickly.', 'Lagi silang malaki at mabilis kumalat.'),
    ('ba4b6130-e64e-46d2-95c9-1ccd993f70d9', 'd4e6806b-2b8d-449c-8299-ecf8a2b2bf62', false,
     'Only trained experts can identify them.', 'Mga sanay na eksperto lang ang nakakakilala sa kanila.'),
    -- M1 Q10: fire not weakening after 5-7 seconds
    ('31f095ad-c130-483f-b498-9ca65c349b85', 'da26e59e-0db6-480d-9e5e-03d9c93d8df6', false,
     'Move closer to aim better.', 'Lumapit para mas maayos ang pagtutok.'),
    ('e98d7e09-a8c4-4a2b-ad37-9a05acff9fc3', 'da26e59e-0db6-480d-9e5e-03d9c93d8df6', false,
     'Keep spraying and hope it works.', 'Ituloy ang pag-spray at umasang gagana.'),
    ('7aa4891b-7476-4622-b80a-85050edc1c1f', 'da26e59e-0db6-480d-9e5e-03d9c93d8df6', true,
     'Stop and evacuate the area.', 'Huminto at lumikas sa lugar.'),
    ('21841720-a358-4c22-b7c0-cfdf00ce5372', 'da26e59e-0db6-480d-9e5e-03d9c93d8df6', false,
     'Switch to a different technique.', 'Lumipat sa ibang paraan ng pagpatay ng apoy.'),
    -- M2 Q5: closed door (correct option was much longer than the distractors)
    ('8ed80bd0-62ef-4ee8-b2b7-3c45340d6103', 'f6589d5b-862b-48ba-b3c8-83a4e0a62128', true,
     'Feel it with the back of your hand. If hot, use another exit.', 'Damhin ito gamit ang likod ng kamay. Kung mainit, gumamit ng ibang labasan.');

  update public.assessment_options o
     set option_text = c.option_text,
         option_text_tl = c.option_text_tl
    from _concise_options c
   where o.id = c.id
     and o.question_id = c.question_id
     and o.is_correct = c.is_correct;
  get diagnostics updated_count = row_count;
  if updated_count <> 41 then
    raise exception 'Expected 41 options updated, got %', updated_count;
  end if;
end;
$$;
