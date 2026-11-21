# Simulador de Reajuste Contratual

Explore uma sequência de índices fictícios e exporte a memória aritmética, com valores em centavos.

## Como usar

Abra a [demonstração](https://martinlofranodeoliveira.github.io/simulador-reajuste-contratual/). Para uso local, execute `python3 -m http.server 8000` no diretório e abra `http://localhost:8000`.

Informe o valor inicial em reais e adicione os índices percentuais na ordem dos períodos. Clique em **Simular reajuste** para ver a trajetória e a memória de cálculo. **Baixar relatório** exporta as linhas em CSV.

## Contrato público

Exercício aritmético com índices fornecidos, sem decidir aplicação de reajuste. input é objeto com baseCents inteiro de 0 a 100000000 e periods array de até 12 objetos {id,rateBps}. id é string de 1 a 32 caracteres ASCII alfanuméricos, hífen ou sublinhado, única no array. rateBps é inteiro de -5000 a 5000. Entrada inválida retorna exatamente {error:"INVALID_INPUT"}.
Retorne {rows,summary}. Comece valor=baseCents e fator=1000000 partes por milhão. Para cada período em ordem, atualize AMBOS multiplicando por (10000+rateBps) e dividindo por 10000; arredonde cada resultado a inteiro no passo (meio para cima, sempre não negativo). rows tem {id,rateBps,factorPpm,valueCents} após cada passo. summary tem {baseCents,finalCents,changeCents,factorPpm}; changeCents é final menos base. Sem períodos, final é igual à base e o fator é 1000000.

## Escopo

Demonstração offline com exemplos fictícios. A equipe responsável avalia documentação, conformidade e habilitação. A interface processa os dados no navegador. O motor foi gerado com Gemini 4 Neon no Vertex AI.

## Testes

Execute `node scripts/test.mjs public.json`.

## Licença

MIT. Acorn preserva sua licença em scripts/vendor/LICENSE-Acorn.txt.
