import {EDITOR, USER} from './src/engine-adapter.js';
let ChatCompletionService = undefined;
try {
    // 动态导入，兼容模块不存在的情况
    const module = await import('/scripts/custom-request.js');
    ChatCompletionService = module.ChatCompletionService;
} catch (e) {
    console.warn("未检测到 /scripts/custom-request.js 或未正确导出 ChatCompletionService，将禁用代理相关功能。", e);
}
export class LLMApiService {
    constructor(config = {}, dependencies = {}) {
        this.config = {
            api_url: config.api_url || "",
            api_key: config.api_key || "",
            model_name: config.model_name || "",
            temperature: config.temperature || 1.0,
            max_tokens: config.max_tokens || 63000,
            stream: config.stream || false
        };
        
        this.deps = dependencies;
        this.EDITOR = this.deps.EDITOR;
        this.USER = this.deps.USER;
    }
   /**
     *  动态更新API配置。
     * 这个新版本能够智能地将外部传入的驼峰命名（如 apiUrl）
     * 映射到内部使用的下划线命名（如 api_url），从而解决数据不匹配问题。
     * @param {object} newConfig - 新的配置项，例如 { apiUrl: "...", apiKey: "..." }
     */
    updateConfig(newConfig) {
        if (newConfig.apiUrl !== undefined) this.config.api_url = newConfig.apiUrl;
        if (newConfig.api_url !== undefined) this.config.api_url = newConfig.api_url;

        if (newConfig.apiKey !== undefined) this.config.api_key = newConfig.apiKey;
        if (newConfig.api_key !== undefined) this.config.api_key = newConfig.api_key;
        
        if (newConfig.modelName !== undefined) this.config.model_name = newConfig.modelName;
        if (newConfig.model_name !== undefined) this.config.model_name = newConfig.model_name;

        if (newConfig.temperature !== undefined) this.config.temperature = newConfig.temperature;
        
        console.info("[LLMApiService] 配置已更新。当前URL:", this.config.api_url ? "已设置" : "空");
    }
async testConnection() {
    if (!this.config.api_url || !this.config.api_key) {
        throw new Error("API URL 和 API Key 不能为空。请先在设置中填写。");
    }

    console.info(`[LLMApiService] 正在使用模型 [${this.config.model_name}] 测试连接...`);

    const testMessages = [{ role: 'user', content: "Hello! Please reply with only one word: 'Success'." }];

    try {
        const responseText = await this.#executeApiCall(testMessages, null);
        
        if (responseText && responseText.toLowerCase().includes('success')) {
            return `连接成功！模型返回: "${responseText}"`;
        } else {
            throw new Error(`连接看似成功，但模型返回了非预期的内容: "${responseText || '空内容'}"`);
        }

    } catch (error) {
        console.error("[LLMApiService] 连接测试失败", error);
        let detail = error.message;
        if (detail.includes('401')) {
            detail = '认证失败 (401)。请检查你的 API Key 是否正确。';
        } else if (detail.includes('404')) {
            detail = '未找到端点 (404)。请检查你的 API URL 是否正确，特别是对于非官方API，URL需要是完整的。';
        } else if (detail.includes('Failed to fetch')) {
            detail = '网络请求失败。请检查你的网络连接、代理设置，或确认API地址是否可以访问。';
        }
        throw new Error(`连接测试失败: ${detail}`);
    }
}
    async callLLM(prompt, streamCallback = null) {
        if (!prompt) throw new Error("输入内容不能为空");
        if (!this.config.api_url || !this.config.api_key || !this.config.model_name) {
            console.error('[DEBUG-PROBE-3] API 配置不完整:', JSON.stringify(this.config, null, 2));
            throw new Error("API配置不完整，请在设置中检查。");
        }

        return await this.#callLLMWithRetry(prompt, streamCallback);
    }

    /**
     * @private
     *  包含自动重试逻辑的核心 LLM 调用方法。
     */
    async #callLLMWithRetry(prompt, streamCallback) {
        const MAX_RETRIES = 3;
        let lastError = null;
        let retryToast = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await this.#executeApiCall(prompt, streamCallback);
                
              if (retryToast) this.EDITOR.clear(retryToast);
            return result;
            } catch (error) {
                lastError = error;
                console.warn(`[LLMApiService] 第 ${attempt} 次API调用失败:`, error);

                 if (retryToast) this.EDITOR.clear(retryToast);
                
                if (attempt < MAX_RETRIES && this.#isRetryableError(error)) {
                    const delay = attempt * 1000; 
                    
                    retryToast = this.EDITOR.warning(
                        `将在 ${delay / 1000} 秒后进行第 ${attempt + 1} 次尝试...<br><small>原因: ${error.message}</small>`,
                        "API连接不稳定，正在自动重试",
                        { 
                            timeOut: delay, 
                            extendedTimeOut: delay, 
                            closeButton: true,
                            escapeHtml: false 
                        }   
                         );
                    await new Promise(resolve => setTimeout(resolve, delay));

                } else {
                    break;
                }
            }
        }
        
        this.EDITOR.error(
            `已尝试 ${MAX_RETRIES} 次，但仍无法连接。<br><small>最终错误: ${lastError.message}</small>`, 
            "API 调用彻底失败", 
            { timeOut: 10000 }
        );
        throw lastError;
    }

    /**
     * @private
     * [新] 判断一个错误是否值得重试。
     */
    #isRetryableError(error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('404')) {
            return false;
        }
        return true;
    }

    /**
     * @private
     * [新] 将原始的 callLLM 逻辑封装成一个独立的私有方法。
     * 这个方法只负责执行一次API调用，不关心重试。
     */
    async #executeApiCall(prompt, streamCallback = null) {
        let messages;
        if (Array.isArray(prompt)) {
            messages = prompt;
        } else {
             messages = [
                { role: 'system', content: this.config.system_prompt },
                { role: 'user', content: prompt }
            ];
        }

        this.config.stream = streamCallback !== null;
        if (USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address) {
            console.log("检测到代理配置，将使用 SillyTavern 内部路由");
            if (typeof ChatCompletionService === 'undefined' || !ChatCompletionService?.processRequest) {
                const errorMessage = "当前酒馆版本过低，无法发送自定义请求。请更新你的酒馆版本";
                this.EDITOR.error(errorMessage); 
                throw new Error(errorMessage);
            }
            try {
                const requestData = {
                    stream: this.config.stream,
                    messages: messages,
                    max_tokens: this.config.max_tokens,
                    model: this.config.model_name,
                    temperature: this.config.temperature,
                    chat_completion_source: 'openai', 
                    custom_url: this.config.api_url,
                    reverse_proxy: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address,
                    proxy_password: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_key || null,
                };

                if (this.config.stream) {
                    if (!streamCallback || typeof streamCallback !== 'function') {
                        throw new Error("流式模式下必须提供有效的streamCallback函数");
                    }
                    const streamGenerator = await ChatCompletionService.processRequest(requestData, {}, false); 
                    let fullResponse = '';
                    for await (const chunk of streamGenerator()) {
                        if (chunk.text) {
                            fullResponse += chunk.text;
                            streamCallback(chunk.text);
                        }
                    }
                    return this.#cleanResponse(fullResponse);
                } else {
                    const responseData = await ChatCompletionService.processRequest(requestData, {}, true); 
                    if (!responseData || !responseData.content) {
                        throw new Error("通过内部路由获取响应失败或响应内容为空");
                    }
                    return this.#cleanResponse(responseData.content);
                }
            } catch (error) {
                console.error("通过 SillyTavern 内部路由调用 LLM API 错误:", error);
                throw error;
            }
        } else {
            console.log("未检测到代理配置，将使用直接 fetch");
            let apiEndpoint = this.config.api_url;
            if (!apiEndpoint.endsWith("/chat/completions")) {
                apiEndpoint += "/chat/completions";
            }

            const headers = {
                'Authorization': `Bearer ${this.config.api_key}`,
                'Content-Type': 'application/json'
            };

            const data = {
                model: this.config.model_name,
                messages: messages,
                temperature: this.config.temperature,
                max_tokens: this.config.max_tokens,
                stream: this.config.stream
            };

            try {
                if (this.config.stream) {
                    if (!streamCallback || typeof streamCallback !== 'function') {
                        throw new Error("流式模式下必须提供有效的streamCallback函数");
                    }
                    return await this.#handleStreamResponse(apiEndpoint, headers, data, streamCallback);
                } else {
                    return await this.#handleRegularResponse(apiEndpoint, headers, data);
                }
            } catch (error) {
                console.error("直接调用 LLM API 错误:", error);
                throw error;
            }
        }
    }

    async #handleRegularResponse(apiEndpoint, headers, data) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        const responseData = await response.json();

        if (!responseData.choices || responseData.choices.length === 0 ||
            !responseData.choices[0].message || !responseData.choices[0].message.content) {
            throw new Error("API返回无效的响应结构");
        }

        let translatedText = responseData.choices[0].message.content;
        return this.#cleanResponse(translatedText);
    }

    async #handleStreamResponse(apiEndpoint, headers, data, streamCallback) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        if (!response.body) {
            throw new Error("无法获取响应流");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullResponse = '';
        let chunkIndex = 0; 

        try {
            console.log('[Stream] Starting stream processing for custom API...'); 
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('[Stream] Custom API stream finished (done=true).'); 
                    break;
                }

                const decodedChunk = decoder.decode(value, { stream: true });
                buffer += decodedChunk;
                chunkIndex++;
                console.log(`[Stream] Custom API received chunk ${chunkIndex}. Buffer length: ${buffer.length}`); 

                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; 

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine === '') continue;
                    console.log(`[Stream] Custom API processing line: "${trimmedLine}"`); 

                    try {
                        if (trimmedLine.startsWith('data: ')) {
                            const dataStr = trimmedLine.substring(6).trim();
                            if (dataStr === '[DONE]') {
                                console.log('[Stream] Custom API received [DONE] marker.'); 
                                continue; 
                            }

                            const jsonData = JSON.parse(dataStr);

                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content); 
                            } else {
                            }
                        } else {
                             console.log('[Stream] Custom API line does not start with "data: ". Skipping.');
                        }
                    } catch (e) {
                        console.warn("[Stream] Custom API error parsing line JSON:", e, "Line:", trimmedLine); 
                    }
                }
            }

            const finalBufferTrimmed = buffer.trim();
            if (finalBufferTrimmed) {
                console.log(`[Stream] Custom API processing final buffer content: "${finalBufferTrimmed}"`); 
                try {
                    if (finalBufferTrimmed.startsWith('data: ')) {
                         const dataStr = finalBufferTrimmed.substring(6).trim();
                         if (dataStr !== '[DONE]') {
                            const jsonData = JSON.parse(dataStr);
                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content);
                            }
                         }
                    }
                } catch (e) {
                    console.warn("[Stream] Custom API error processing final buffer content:", e);
                }
            }

            console.log('[Stream] Custom API stream processing complete. Full response length:', fullResponse.length); 
            return this.#cleanResponse(fullResponse);
        } catch (streamError) {
            console.error('[Stream] Custom API error during stream reading:', streamError); 
            throw streamError; 
        } finally {
            console.log('[Stream] Custom API releasing stream lock.'); 
            reader.releaseLock();
        }
    }

    #cleanResponse(text) {
        return text.trim();
    }

    
}

export default LLMApiService;
