# Eval de categorização — só motor de regras

- Data: 2026-11-17
- Modelo: nenhum (determinístico)
- Conjunto: 203 descrições sintéticas (evals/categorizacao.csv)

| Medida | Valor |
| --- | --- |
| Acerto geral | 27.1% (55/203) |
| Cobertura (propôs alguma categoria) | 19.7% (40/203) |
| Acerto quando propõe | 87.5% (35/40) |

| Caso | Acerto |
| --- | --- |
| claro | 27.2% (31/114) |
| sem_ancora | 70.8% (17/24) |
| ambiguo | 13.8% (4/29) |
| abreviacao | 8.3% (3/36) |

## Erros (148)

| id | descrição | esperada | prevista | caso |
| --- | --- | --- | --- | --- |
| e009 | `DEB AUTOMATICO ENEL DISTRIBUICAO SP` | Moradia | Não categorizado | claro |
| e011 | `SUPERM GUANABARA 07` | Alimentação | Não categorizado | abreviacao |
| e012 | `MAGALU*PARC 03/10` | Compras | Não categorizado | abreviacao |
| e013 | `PIX RECEBIDO 34.567.890/0001-12` | Receita | Não categorizado | sem_ancora |
| e015 | `TAR MANUT CTA` | Serviços | Não categorizado | abreviacao |
| e016 | `DL*GOOGLE YouTube` | Lazer | Não categorizado | abreviacao |
| e018 | `DROG SAO PAULO 4471` | Saúde | Não categorizado | abreviacao |
| e019 | `DA COPEL DIS 05/26` | Moradia | Não categorizado | abreviacao |
| e020 | `PUC MG MENSAL PARC 06` | Educação | Não categorizado | abreviacao |
| e021 | `COMPRA DEB PAO DE ACUCAR 1234 SAO PAULO SP` | Alimentação | Não categorizado | claro |
| e023 | `PIX RECEBIDO MARIANA COSTA LIMA` | Receita | Não categorizado | claro |
| e024 | `99 TECNOLOGIA LTDA` | Transporte | Não categorizado | claro |
| e028 | `PAG BOLETO AMIL ASSISTENCIA MEDICA` | Saúde | Não categorizado | claro |
| e030 | `PAG BOLETO COLEGIO SANTA MARIA MENSALIDADE` | Educação | Não categorizado | claro |
| e031 | `COMPRA CARTAO ZE DELIVERY BEBIDAS` | Alimentação | Não categorizado | ambiguo |
| e032 | `COMPRA CARTAO LOJAS AMERICANAS 1123` | Compras | Não categorizado | ambiguo |
| e033 | `REND PAGO APLIC AUT MAIS` | Receita | Não categorizado | abreviacao |
| e035 | `PAG BOLETO PORTO SEGURO AUTO` | Serviços | Não categorizado | ambiguo |
| e036 | `DECOLAR.COM` | Lazer | Não categorizado | ambiguo |
| e038 | `DROGA RAIA 0291` | Saúde | Não categorizado | ambiguo |
| e039 | `DESENTUPIDORA SAO JORGE` | Moradia | Não categorizado | ambiguo |
| e040 | `PAPELARIA E MATERIAL ESCOLAR NOVO TEMPO` | Educação | Não categorizado | ambiguo |
| e041 | `COMPRA CARTAO CARREFOUR HIPER 087 CAMPINAS SP` | Alimentação | Não categorizado | claro |
| e042 | `COMPRA CARTAO RENNER LJ 087 SHOP IGUATEMI` | Compras | Não categorizado | claro |
| e046 | `DISNEY PLUS` | Lazer | Não categorizado | claro |
| e048 | `FLEURY MEDICINA E SAUDE` | Saúde | Não categorizado | claro |
| e049 | `DEB AUT SABESP` | Moradia | Não categorizado | claro |
| e051 | `IFD*JAPA SUSHI DELIV` | Alimentação | Não categorizado | abreviacao |
| e052 | `PAYPAL *ALIEXPRESS` | Compras | Não categorizado | abreviacao |
| e053 | `TED 001 0234 12345-6` | Receita | Não categorizado | sem_ancora |
| e055 | `TARIFA 0457 REF 10/26` | Serviços | Não categorizado | sem_ancora |
| e056 | `CHOPERIA PINGUIM RIB PRET` | Lazer | Não categorizado | abreviacao |
| e058 | `FARM PAGUE MENOS 0823 FORTALEZA` | Saúde | Não categorizado | abreviacao |
| e059 | `PGTO COND RES JD BOTAN` | Moradia | Não categorizado | abreviacao |
| e060 | `HTM*CURSOEXCELPRO` | Educação | Não categorizado | abreviacao |
| e061 | `ASSAI ATACADISTA LJ 112 GUARULHOS` | Alimentação | Não categorizado | claro |
| e063 | `TED RECEBIDA CONSTRUTORA HORIZONTE LTDA` | Receita | Não categorizado | claro |
| e064 | `METRO SAO PAULO RECARGA` | Transporte | Não categorizado | claro |
| e065 | `TARIFA PACOTE DE SERVICOS` | Serviços | Não categorizado | claro |
| e068 | `PIX ENVIADO CLINICA ODONTOLOGICA SORRISO` | Saúde | Não categorizado | claro |
| e069 | `PAG BOLETO COMGAS` | Moradia | Não categorizado | claro |
| e071 | `AM PM CONVENIENCIA POSTO IPIRANGA 330` | Alimentação | Transporte | ambiguo |
| e072 | `LEROY MERLIN CIA BRAS BRICOLAGEM` | Compras | Não categorizado | ambiguo |
| e073 | `REEMBOLSO UNIMED CONSULTA` | Receita | Saúde | ambiguo |
| e074 | `LATAM AIRLINES BRASIL` | Transporte | Não categorizado | ambiguo |
| e075 | `PAYPAL *DROPBOX` | Serviços | Não categorizado | abreviacao |
| e076 | `AMAZON PRIME BR` | Lazer | Compras | ambiguo |
| e078 | `SMART FIT MENSALIDADE` | Saúde | Não categorizado | ambiguo |
| e079 | `DEB AUT CIA SANEAM PARANA` | Moradia | Não categorizado | abreviacao |
| e080 | `LIVRARIA DA VILA LJ 4` | Educação | Não categorizado | ambiguo |
| e083 | `ESTORNO COMPRA MAGAZINE LUIZA` | Receita | Compras | claro |
| e085 | `ANUIDADE CARTAO PARC 04/12` | Serviços | Não categorizado | claro |
| e086 | `INGRESSO.COM` | Lazer | Não categorizado | claro |
| e090 | `COURSERA` | Educação | Não categorizado | claro |
| e091 | `PANIF E CONF NOVA ESPER` | Alimentação | Não categorizado | abreviacao |
| e092 | `CASAS PERNAMBUC 0034 RECIFE` | Compras | Não categorizado | abreviacao |
| e093 | `DEPOSITO EM DINHEIRO AG 0987` | Receita | Não categorizado | sem_ancora |
| e094 | `EST SHOP VILLA LOBOS` | Transporte | Não categorizado | abreviacao |
| e095 | `APPLE.COM/BILL` | Serviços | Não categorizado | ambiguo |
| e096 | `PAYPAL *NUUVEMJOGOS` | Lazer | Não categorizado | abreviacao |
| e098 | `BLUEFIT ACAD MOOCA` | Saúde | Não categorizado | abreviacao |
| e099 | `PAG BOLETO PREFEITURA DE SAO PAULO IPTU 2026 PARC 08` | Moradia | Não categorizado | claro |
| e100 | `EBANX*DESCOMPLICA` | Educação | Não categorizado | abreviacao |
| e101 | `MCDONALDS 05321 RIO DE JANEIRO BR` | Alimentação | Não categorizado | claro |
| e102 | `PETZ PET CENTER` | Compras | Não categorizado | ambiguo |
| e103 | `CRED 13 SAL 1A PARC` | Receita | Não categorizado | abreviacao |
| e104 | `LOCALIZA RENT A CAR` | Transporte | Não categorizado | ambiguo |
| e105 | `GOOGLE *Google One` | Serviços | Não categorizado | claro |
| e106 | `CLUBE ATLETICO PAULISTANO MENSALIDADE` | Lazer | Não categorizado | ambiguo |
| e108 | `HAPVIDA ASSISTENCIA MEDICA` | Saúde | Não categorizado | claro |
| e109 | `DEB AUTOMATICO CEMIG DISTRIBUICAO` | Moradia | Não categorizado | claro |
| e110 | `PIX ENVIADO ESCOLA DE IDIOMAS WIZARD` | Educação | Não categorizado | claro |
| e112 | `COMPRA CARTAO CASAS BAHIA ONLINE` | Compras | Não categorizado | claro |
| e113 | `DIVIDENDOS ITAUSA PN` | Receita | Não categorizado | claro |
| e114 | `SEM PARAR MENSALIDADE` | Transporte | Não categorizado | claro |
| e115 | `NET SERV COMUNIC SA` | Serviços | Não categorizado | abreviacao |
| e118 | `OTICAS CAROL` | Saúde | Não categorizado | ambiguo |
| e119 | `Pagamento de conta - Light Servicos de Eletricidade` | Moradia | Não categorizado | claro |
| e120 | `SYMPLA*WORKSHOP UX` | Educação | Não categorizado | ambiguo |
| e122 | `AMZN Mktp BR*2K4LP91` | Compras | Não categorizado | abreviacao |
| e123 | `CRED TRANSF 0001 33 445566` | Receita | Não categorizado | sem_ancora |
| e124 | `CCR AUTOBAN PEDAGIO` | Transporte | Não categorizado | claro |
| e125 | `MICROSOFT*MICROSOFT 365 P` | Serviços | Não categorizado | claro |
| e126 | `PlayStation Network` | Lazer | Não categorizado | claro |
| e128 | `CONSULTORIO DR RICARDO MENDES` | Saúde | Não categorizado | claro |
| e130 | `KUMON UNIDADE VILA MARIANA` | Educação | Não categorizado | claro |
| e131 | `MP*LANCHONETEDOZE` | Alimentação | Não categorizado | abreviacao |
| e132 | `Compra debito - Riachuelo Shopping Tambore` | Compras | Não categorizado | claro |
| e133 | `RESTITUICAO IRPF 2026 LOTE 3` | Receita | Não categorizado | claro |
| e135 | `IOF COMPRA INTERNACIONAL` | Serviços | Não categorizado | ambiguo |
| e136 | `AIRBNB * HMQ8ZT4K` | Lazer | Não categorizado | claro |
| e138 | `HOSP STA CATARINA` | Saúde | Não categorizado | abreviacao |
| e139 | `ULTRAGAZ GAS LP` | Moradia | Não categorizado | claro |
| e140 | `Pag boleto - Universidade Presbiteriana Mackenzie` | Educação | Não categorizado | claro |
| e142 | `KABUM COMERCIO ELETRONICO LIMEIRA` | Compras | Não categorizado | claro |
| e143 | `CRED INSS APOSENT` | Receita | Não categorizado | abreviacao |
| e144 | `PAG BOLETO DETRAN SP IPVA 2026` | Transporte | Não categorizado | claro |
| e145 | `OPENAI *CHATGPT SUBSCR` | Serviços | Não categorizado | claro |
| e146 | `BOOKING.COM HOTEL` | Lazer | Não categorizado | claro |
| e148 | `Laboratorio Sabin Brasilia` | Saúde | Não categorizado | claro |
| e149 | `PAG BOLETO TAXA DE LIXO PREFEITURA SALVADOR` | Moradia | Não categorizado | claro |
| e150 | `DUOLINGO*SUPER` | Educação | Não categorizado | claro |
| e151 | `COMPRA DEB SAMS CLUB 5612 SAO BERNARDO` | Alimentação | Não categorizado | ambiguo |
| e152 | `DECATHLON MORUMBI` | Compras | Não categorizado | ambiguo |
| e153 | `CREDITO CASHBACK` | Receita | Não categorizado | claro |
| e154 | `OFICINA MECANICA IRMAOS SOUZA` | Transporte | Não categorizado | claro |
| e155 | `PRUDENTIAL DO BR SEG VIDA` | Serviços | Não categorizado | abreviacao |
| e156 | `EVENTIM BRASIL SAO PAULO` | Lazer | Serviços | claro |
| e158 | `COMPRA CARTAO PANVEL 112 PORTO ALEGRE` | Saúde | Não categorizado | ambiguo |
| e159 | `NATURGY CEG RIO` | Moradia | Não categorizado | claro |
| e160 | `COMPRA CARTAO OUTBACK STEAKHOUSE SHOP MORUMBI` | Alimentação | Não categorizado | claro |
| e161 | `NETSHOES BR` | Compras | Não categorizado | claro |
| e162 | `DOC RECEBIDO 341 1522` | Receita | Não categorizado | sem_ancora |
| e163 | `Recarga Bilhete Unico SPTrans` | Transporte | Não categorizado | claro |
| e164 | `ADOBE *CREATIVE CLOUD` | Serviços | Não categorizado | claro |
| e165 | `GLOBOPLAY` | Lazer | Não categorizado | claro |
| e167 | `HIPERM EXTRA STO ANDRE` | Alimentação | Não categorizado | abreviacao |
| e168 | `MP*LOJADOCELULAR` | Compras | Não categorizado | abreviacao |
| e169 | `PIX RECEBIDO STUDIO DESIGN ME` | Receita | Não categorizado | claro |
| e170 | `CONECTCAR PEDAGIO` | Transporte | Não categorizado | claro |
| e171 | `JUROS LIMITE DA CONTA` | Serviços | Não categorizado | claro |
| e172 | `BETO CARRERO WORLD PENHA SC` | Lazer | Não categorizado | claro |
| e174 | `ATACADAO 345 BELO HORIZONTE MG` | Alimentação | Não categorizado | claro |
| e175 | `COMPRA CARTAO ZARA BRASIL LTDA` | Compras | Não categorizado | claro |
| e176 | `JCP BBAS3` | Receita | Não categorizado | abreviacao |
| e177 | `CENTRO AUTOMOTIVO PIT STOP TROCA DE OLEO` | Transporte | Não categorizado | claro |
| e178 | `LAVANDERIA 5ASEC JARDIM BOTANICO` | Serviços | Não categorizado | claro |
| e179 | `BAR DO JUAREZ VILA MADALENA` | Lazer | Não categorizado | claro |
| e181 | `REST E PIZZ BELLA NAPO` | Alimentação | Não categorizado | abreviacao |
| e182 | `TOK&STOK SHOP D PEDRO` | Compras | Não categorizado | ambiguo |
| e183 | `Pix recebido - Fernando Alves Rocha` | Receita | Não categorizado | claro |
| e185 | `BARBEARIA DOM BIGODE` | Serviços | Não categorizado | claro |
| e186 | `SYMPLA*SHOW ROUPA NOVA` | Lazer | Não categorizado | claro |
| e188 | `HORTIFRUTI LJ 22 NITEROI RJ` | Alimentação | Não categorizado | claro |
| e189 | `SHEIN *SHEIN.COM` | Compras | Não categorizado | claro |
| e190 | `PIX DEVOLVIDO E7F3K92` | Receita | Não categorizado | sem_ancora |
| e191 | `PAG BOLETO MULTA DE TRANSITO DER MG` | Transporte | Não categorizado | claro |
| e192 | `CORREIOS AG CENTRAL CURITIBA` | Serviços | Não categorizado | claro |
| e193 | `COMPRA DEB ACOUGUE CASA DE CARNES BOI GORDO` | Alimentação | Não categorizado | claro |
| e194 | `C&A MODAS LJ 455 CURITIBA PR` | Compras | Não categorizado | claro |
| e195 | `CREDITO FGTS SAQUE ANIVERSARIO` | Receita | Não categorizado | claro |
| e196 | `CARTORIO 2 OFICIO DE NOTAS` | Serviços | Não categorizado | claro |
| e197 | `STARBUCKS AV PAULISTA SAO PAULO` | Alimentação | Não categorizado | claro |
| e198 | `FAST SHOP SA MORUMBI` | Compras | Não categorizado | claro |
| e200 | `COMPRA CARTAO BURGER KING 1187 RECIFE PE` | Alimentação | Não categorizado | claro |
| e201 | `COMPRA CARTAO CIA ZAFFARI BOURBON IPIRANGA PORTO ALEGRE RS` | Alimentação | Não categorizado | claro |
| e202 | `ODONTOPREV` | Saúde | Não categorizado | claro |
| e203 | `ACADEMIA BODYTECH` | Saúde | Não categorizado | claro |
